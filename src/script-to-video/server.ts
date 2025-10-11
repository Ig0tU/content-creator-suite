#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { logger, createTraceId, logWithTrace } from '../shared/logger.js';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const SCRIPT_TO_VIDEO_TOOLS: Tool[] = [
  {
    name: 'generate_video_script',
    description: 'Generate full video script from idea/outline with timestamps, hooks, transitions',
    inputSchema: {
      type: 'object',
      properties: {
        idea: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            hook: { type: 'string' },
            platform: { type: 'string', enum: ['youtube', 'tiktok', 'instagram-reels', 'youtube-shorts'] },
            duration: { type: 'number', description: 'Target duration in seconds' },
            outline: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  section: { type: 'string' },
                  duration: { type: 'number' },
                  keyPoints: { type: 'array', items: { type: 'string' } }
                }
              }
            }
          },
          required: ['title', 'hook', 'platform', 'duration']
        },
        tone: { type: 'string', enum: ['energetic', 'educational', 'casual', 'professional', 'humorous'] },
        includeVoiceover: { type: 'boolean', description: 'Generate voiceover script' },
        includeBRoll: { type: 'boolean', description: 'Generate b-roll suggestions' }
      },
      required: ['idea']
    }
  },
  {
    name: 'generate_storyboard',
    description: 'Create visual storyboard from script with shot list, camera angles, visuals',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string' },
        platform: { type: 'string', enum: ['youtube', 'tiktok', 'instagram-reels', 'youtube-shorts'] },
        visualStyle: { type: 'string', enum: ['talking-head', 'b-roll-heavy', 'screen-record', 'animated', 'hybrid'] }
      },
      required: ['script', 'platform']
    }
  },
  {
    name: 'generate_voiceover',
    description: 'Generate AI voiceover audio file from script (ElevenLabs or HuggingFace TTS)',
    inputSchema: {
      type: 'object',
      properties: {
        script: { type: 'string' },
        voice: { type: 'string', description: 'Voice ID or type (male/female/energetic/calm)' },
        provider: { type: 'string', enum: ['elevenlabs', 'huggingface'], default: 'huggingface' },
        format: { type: 'string', enum: ['mp3', 'wav'], default: 'mp3' }
      },
      required: ['script']
    }
  },
  {
    name: 'export_editing_project',
    description: 'Export timeline to Final Cut Pro XML, Premiere Pro XML, or DaVinci Resolve',
    inputSchema: {
      type: 'object',
      properties: {
        storyboard: { type: 'object' },
        voiceoverPath: { type: 'string' },
        bRollSuggestions: { type: 'array', items: { type: 'string' } },
        format: { type: 'string', enum: ['fcpxml', 'premiere-xml', 'davinci-xml'] }
      },
      required: ['storyboard', 'format']
    }
  }
];

const GenerateScriptArgsSchema = z.object({
  idea: z.object({
    title: z.string(),
    hook: z.string(),
    platform: z.enum(['youtube', 'tiktok', 'instagram-reels', 'youtube-shorts']),
    duration: z.number(),
    outline: z.array(z.object({
      section: z.string(),
      duration: z.number(),
      keyPoints: z.array(z.string())
    })).optional()
  }),
  tone: z.enum(['energetic', 'educational', 'casual', 'professional', 'humorous']).default('casual'),
  includeVoiceover: z.boolean().default(true),
  includeBRoll: z.boolean().default(true)
});

const GenerateStoryboardArgsSchema = z.object({
  script: z.string(),
  platform: z.enum(['youtube', 'tiktok', 'instagram-reels', 'youtube-shorts']),
  visualStyle: z.enum(['talking-head', 'b-roll-heavy', 'screen-record', 'animated', 'hybrid']).default('hybrid')
});

const GenerateVoiceoverArgsSchema = z.object({
  script: z.string(),
  voice: z.string().default('neutral'),
  provider: z.enum(['elevenlabs', 'huggingface']).default('huggingface'),
  format: z.enum(['mp3', 'wav']).default('mp3')
});

const ExportProjectArgsSchema = z.object({
  storyboard: z.object({}).passthrough(),
  voiceoverPath: z.string().optional(),
  bRollSuggestions: z.array(z.string()).optional(),
  format: z.enum(['fcpxml', 'premiere-xml', 'davinci-xml'])
});

async function generateVideoScript(args: z.infer<typeof GenerateScriptArgsSchema>, traceId: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not found');
  }

  const gemini = new GoogleGenerativeAI(apiKey);
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const platformSpecs = {
    'youtube': { maxDuration: 720, idealDuration: 480, hookDuration: 15 },
    'tiktok': { maxDuration: 180, idealDuration: 60, hookDuration: 3 },
    'instagram-reels': { maxDuration: 90, idealDuration: 45, hookDuration: 3 },
    'youtube-shorts': { maxDuration: 60, idealDuration: 45, hookDuration: 5 }
  };

  const spec = platformSpecs[args.idea.platform];

  const prompt = `Generate a COMPLETE video script for ${args.idea.platform}.

**Video Details:**
- Title: ${args.idea.title}
- Hook: ${args.idea.hook}
- Target Duration: ${args.idea.duration}s (max: ${spec.maxDuration}s)
- Tone: ${args.tone}

**Platform Requirements:**
- Hook must grab attention in first ${spec.hookDuration} seconds
- ${args.idea.platform === 'youtube' ? 'Pattern interrupt every 30-45s to maintain retention' : 'Fast-paced, high energy throughout'}
- ${args.idea.platform === 'tiktok' || args.idea.platform === 'instagram-reels' ? 'Vertical format (9:16)' : 'Horizontal format (16:9)'}

**Script Structure (return JSON):**
{
  "title": "${args.idea.title}",
  "platform": "${args.idea.platform}",
  "totalDuration": ${args.idea.duration},
  "scenes": [
    {
      "timestamp": "00:00",
      "duration": ${spec.hookDuration},
      "sceneType": "hook",
      "voiceover": "Exact words to say (conversational, ${args.tone} tone)",
      "onScreenText": "Text overlays (if any)",
      "visualCue": "What viewer sees (camera angle, b-roll, graphics)",
      "audioNotes": "Music/SFX suggestions",
      "transitionTo": "cut/fade/zoom"
    }
  ],
  "bRollSuggestions": [
    {
      "timestamp": "00:15",
      "description": "Stock footage of...",
      "keywords": ["search", "terms"],
      "duration": 3
    }
  ],
  "musicSuggestions": {
    "genre": "upbeat electronic",
    "mood": "energetic",
    "keywords": ["royalty-free", "non-copyrighted"]
  },
  "callToAction": {
    "timestamp": "${Math.floor(args.idea.duration * 0.9)}s",
    "voiceover": "Subscribe for more...",
    "visualCue": "Subscribe button animation"
  }
}

**Critical:**
- Every ${args.tone === 'educational' ? '60' : '30'} seconds, add a pattern interrupt (question, visual change, reveal)
- Include timestamps for EVERY scene change
- Voiceover must be word-for-word, natural speech (contractions, filler words if casual)
- Visual cues must be specific ("Close-up of hands typing", not "Person working")
${args.includeBRoll ? '- Suggest 8-12 b-roll clips with exact timestamps' : ''}

Generate the COMPLETE script now.`;

  logWithTrace(traceId, 'info', 'Generating video script', { title: args.idea.title, duration: args.idea.duration });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to extract JSON from AI response');
  }

  const script = JSON.parse(jsonMatch[0]);

  logWithTrace(traceId, 'info', 'Script generated', { scenes: script.scenes?.length || 0 });

  return script;
}

async function generateStoryboard(args: z.infer<typeof GenerateStoryboardArgsSchema>, traceId: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not found');
  }

  const gemini = new GoogleGenerativeAI(apiKey);
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const prompt = `Create a detailed visual storyboard from this video script.

**Script:**
${args.script}

**Platform:** ${args.platform}
**Visual Style:** ${args.visualStyle}

Return JSON:
{
  "shots": [
    {
      "shotNumber": 1,
      "timestamp": "00:00",
      "duration": 5,
      "shotType": "wide/medium/close-up/extreme-close-up",
      "cameraAngle": "eye-level/high-angle/low-angle/dutch-tilt",
      "cameraMovement": "static/pan/tilt/dolly/zoom",
      "subject": "What's in frame",
      "lighting": "Natural/studio/dramatic/soft",
      "composition": "Rule of thirds description",
      "visualNotes": "Detailed description for videographer",
      "thumbnail": "AI image prompt for this shot (for pre-viz)"
    }
  ],
  "equipmentNeeded": ["camera", "tripod", "lighting"],
  "locations": ["home office", "outdoor park"],
  "props": ["laptop", "coffee mug"]
}

Platform-specific guidelines:
- ${args.platform === 'tiktok' || args.platform === 'instagram-reels' ? 'Vertical framing, dynamic movement' : 'Horizontal framing, stable shots'}
- ${args.visualStyle === 'b-roll-heavy' ? 'Minimize talking-head, maximize action shots' : ''}
- ${args.visualStyle === 'screen-record' ? 'Focus on screen captures with cursor movement' : ''}

Generate complete storyboard now.`;

  logWithTrace(traceId, 'info', 'Generating storyboard', { platform: args.platform, style: args.visualStyle });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const storyboard = jsonMatch ? JSON.parse(jsonMatch[0]) : { shots: [] };

  logWithTrace(traceId, 'info', 'Storyboard generated', { shots: storyboard.shots?.length || 0 });

  return storyboard;
}

async function generateVoiceover(args: z.infer<typeof GenerateVoiceoverArgsSchema>, traceId: string) {
  logWithTrace(traceId, 'info', 'Generating voiceover', { provider: args.provider, voice: args.voice });

  if (args.provider === 'elevenlabs') {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error('ELEVENLABS_API_KEY not found. Set it or use provider: "huggingface"');
    }

    // ElevenLabs TTS API
    const response = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${args.voice || '21m00Tcm4TlvDq8ikWAM'}`,
      {
        text: args.script,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      },
      {
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json'
        },
        responseType: 'arraybuffer'
      }
    );

    const audioBuffer = Buffer.from(response.data);
    const outputPath = `/tmp/voiceover-${traceId}.${args.format}`;

    const fs = await import('fs');
    fs.writeFileSync(outputPath, audioBuffer);

    logWithTrace(traceId, 'info', 'Voiceover generated (ElevenLabs)', { path: outputPath, size: audioBuffer.length });

    return {
      success: true,
      audioPath: outputPath,
      provider: 'elevenlabs',
      duration: Math.floor(args.script.length / 15), // Rough estimate: 15 chars/sec
      format: args.format
    };
  }

  // HuggingFace TTS (fallback)
  const HF_API_KEY = process.env.HUGGINGFACE_API_KEY;
  if (!HF_API_KEY) {
    throw new Error('HUGGINGFACE_API_KEY not found');
  }

  const response = await axios.post(
    'https://api-inference.huggingface.co/models/facebook/fastspeech2-en-ljspeech',
    { inputs: args.script },
    {
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      responseType: 'arraybuffer'
    }
  );

  const audioBuffer = Buffer.from(response.data);
  const outputPath = `/tmp/voiceover-${traceId}.${args.format}`;

  const fs = await import('fs');
  fs.writeFileSync(outputPath, audioBuffer);

  logWithTrace(traceId, 'info', 'Voiceover generated (HuggingFace)', { path: outputPath, size: audioBuffer.length });

  return {
    success: true,
    audioPath: outputPath,
    provider: 'huggingface',
    duration: Math.floor(args.script.length / 15),
    format: args.format,
    note: 'For production quality, use ElevenLabs (set ELEVENLABS_API_KEY)'
  };
}

async function exportEditingProject(args: z.infer<typeof ExportProjectArgsSchema>, traceId: string) {
  logWithTrace(traceId, 'info', 'Exporting editing project', { format: args.format });

  // Generate XML based on format
  let xml = '';

  if (args.format === 'fcpxml') {
    // Final Cut Pro X XML
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.9">
  <resources>
    <format id="r1" name="FFVideoFormat1080p30" frameDuration="1001/30000s" width="1920" height="1080"/>
    ${args.voiceoverPath ? `<asset id="r2" src="file://${args.voiceoverPath}" start="0s" duration="60s" hasAudio="1"/>` : ''}
  </resources>
  <library>
    <event name="AI Generated Video">
      <project name="${(args.storyboard as any).title || 'Untitled'}">
        <sequence format="r1" duration="60s">
          <spine>
            ${args.voiceoverPath ? '<audio ref="r2" offset="0s" duration="60s"/>' : ''}
            <!-- Add video clips here based on storyboard -->
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>`;
  } else if (args.format === 'premiere-xml') {
    // Adobe Premiere Pro XML
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<xmeml version="5">
  <sequence>
    <name>AI Generated Video</name>
    <duration>1800</duration>
    <rate>
      <timebase>30</timebase>
    </rate>
    <media>
      <audio>
        ${args.voiceoverPath ? `<track><clipitem><file><pathurl>file://${args.voiceoverPath}</pathurl></file></clipitem></track>` : ''}
      </audio>
    </media>
  </sequence>
</xmeml>`;
  } else {
    // DaVinci Resolve XML (EDL-based)
    xml = `TITLE: AI Generated Video
FCM: NON-DROP FRAME

001  BL       V     C        00:00:00:00 00:00:10:00 00:00:00:00 00:00:10:00
* FROM CLIP NAME: Voiceover
`;
  }

  const outputPath = `/tmp/project-${traceId}.${args.format === 'fcpxml' ? 'fcpxml' : 'xml'}`;
  const fs = await import('fs');
  fs.writeFileSync(outputPath, xml);

  logWithTrace(traceId, 'info', 'Project exported', { path: outputPath, format: args.format });

  return {
    success: true,
    projectPath: outputPath,
    format: args.format,
    instructions: `Import ${outputPath} into ${args.format === 'fcpxml' ? 'Final Cut Pro X' : args.format === 'premiere-xml' ? 'Adobe Premiere Pro' : 'DaVinci Resolve'}`
  };
}

async function main() {
  const server = new Server(
    {
      name: 'script-to-video-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: SCRIPT_TO_VIDEO_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const traceId = createTraceId();

    try {
      if (request.params.name === 'generate_video_script') {
        const args = GenerateScriptArgsSchema.parse(request.params.arguments);
        const script = await generateVideoScript(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(script, null, 2)
            }
          ]
        };
      }

      if (request.params.name === 'generate_storyboard') {
        const args = GenerateStoryboardArgsSchema.parse(request.params.arguments);
        const storyboard = await generateStoryboard(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(storyboard, null, 2)
            }
          ]
        };
      }

      if (request.params.name === 'generate_voiceover') {
        const args = GenerateVoiceoverArgsSchema.parse(request.params.arguments);
        const voiceover = await generateVoiceover(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(voiceover, null, 2)
            }
          ]
        };
      }

      if (request.params.name === 'export_editing_project') {
        const args = ExportProjectArgsSchema.parse(request.params.arguments);
        const project = await exportEditingProject(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(project, null, 2)
            }
          ]
        };
      }

      throw new Error(`Unknown tool: ${request.params.name}`);
    } catch (error) {
      logWithTrace(traceId, 'error', 'Tool execution failed', { error });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error',
              traceId
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('Script-to-Video MCP Server running on stdio');
}

main().catch((error) => {
  logger.error('Fatal error', { error });
  process.exit(1);
});
