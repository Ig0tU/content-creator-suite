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

const GROWTH_OPTIMIZER_TOOLS: Tool[] = [
  {
    name: 'optimize_seo',
    description: 'Optimize video title, description, tags for maximum discoverability',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        platform: { type: 'string', enum: ['youtube', 'tiktok', 'instagram'] },
        niche: { type: 'string' },
        targetAudience: { type: 'string' }
      },
      required: ['title', 'description', 'platform', 'niche']
    }
  },
  {
    name: 'generate_thumbnail_concepts',
    description: 'Generate 5 high-CTR thumbnail concepts with A/B test suggestions',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        platform: { type: 'string', enum: ['youtube', 'tiktok', 'instagram'] },
        niche: { type: 'string' },
        style: { type: 'string', enum: ['minimalist', 'bold-text', 'reaction-face', 'before-after', 'mystery'] }
      },
      required: ['title', 'platform']
    }
  },
  {
    name: 'optimize_posting_schedule',
    description: 'Analyze audience analytics and suggest optimal posting times',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', enum: ['youtube', 'tiktok', 'instagram', 'twitter'] },
        timezone: { type: 'string', description: 'Audience timezone (e.g., America/New_York)' },
        audienceDemographics: {
          type: 'object',
          properties: {
            ageRange: { type: 'string' },
            topCountries: { type: 'array', items: { type: 'string' } },
            gender: { type: 'object' }
          }
        },
        historicalPerformance: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              postTime: { type: 'string' },
              views: { type: 'number' },
              engagement: { type: 'number' }
            }
          }
        }
      },
      required: ['platform', 'timezone']
    }
  },
  {
    name: 'repurpose_content',
    description: 'Take 1 long-form video and generate 10+ short-form clips with hooks',
    inputSchema: {
      type: 'object',
      properties: {
        videoTranscript: { type: 'string' },
        videoDuration: { type: 'number', description: 'Original video duration in seconds' },
        targetPlatforms: {
          type: 'array',
          items: { type: 'string', enum: ['tiktok', 'instagram-reels', 'youtube-shorts', 'twitter'] }
        },
        clipDuration: { type: 'number', description: 'Target clip length (15-60s)', default: 45 }
      },
      required: ['videoTranscript', 'videoDuration', 'targetPlatforms']
    }
  },
  {
    name: 'run_ab_test',
    description: 'Generate A/B test variants for thumbnails, titles, or hooks',
    inputSchema: {
      type: 'object',
      properties: {
        element: { type: 'string', enum: ['thumbnail', 'title', 'hook'] },
        original: { type: 'string', description: 'Original version' },
        variants: { type: 'number', description: 'Number of variants to generate (2-5)', default: 3 },
        platform: { type: 'string', enum: ['youtube', 'tiktok', 'instagram'] }
      },
      required: ['element', 'original', 'platform']
    }
  }
];

const OptimizeSEOArgsSchema = z.object({
  title: z.string(),
  description: z.string(),
  platform: z.enum(['youtube', 'tiktok', 'instagram']),
  niche: z.string(),
  targetAudience: z.string().optional()
});

const GenerateThumbnailArgsSchema = z.object({
  title: z.string(),
  platform: z.enum(['youtube', 'tiktok', 'instagram']),
  niche: z.string().optional(),
  style: z.enum(['minimalist', 'bold-text', 'reaction-face', 'before-after', 'mystery']).optional()
});

const OptimizeScheduleArgsSchema = z.object({
  platform: z.enum(['youtube', 'tiktok', 'instagram', 'twitter']),
  timezone: z.string(),
  audienceDemographics: z.object({
    ageRange: z.string().optional(),
    topCountries: z.array(z.string()).optional(),
    gender: z.object({}).passthrough().optional()
  }).optional(),
  historicalPerformance: z.array(z.object({
    postTime: z.string(),
    views: z.number(),
    engagement: z.number()
  })).optional()
});

const RepurposeContentArgsSchema = z.object({
  videoTranscript: z.string(),
  videoDuration: z.number(),
  targetPlatforms: z.array(z.enum(['tiktok', 'instagram-reels', 'youtube-shorts', 'twitter'])),
  clipDuration: z.number().default(45)
});

const RunABTestArgsSchema = z.object({
  element: z.enum(['thumbnail', 'title', 'hook']),
  original: z.string(),
  variants: z.number().int().min(2).max(5).default(3),
  platform: z.enum(['youtube', 'tiktok', 'instagram'])
});

async function optimizeSEO(args: z.infer<typeof OptimizeSEOArgsSchema>, traceId: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not found');
  }

  const gemini = new GoogleGenerativeAI(apiKey);
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const platformRules = {
    youtube: {
      titleLength: '40-70 characters (mobile truncates at 60)',
      descriptionLength: 'First 150 chars appear above fold, use 5000 max',
      tags: '10-15 tags, mix broad + specific, include misspellings',
      keywords: 'Front-load title with keyword, repeat 2-3x in description'
    },
    tiktok: {
      titleLength: '150 chars max, but shorter = better',
      descriptionLength: 'NA (caption = title)',
      tags: '3-5 hashtags: 1 viral (#fyp), 1 niche, 1 specific',
      keywords: 'Use trending sounds + keywords in caption'
    },
    instagram: {
      titleLength: '125 chars visible, 2200 max',
      descriptionLength: 'First line = hook, hashtags at end or first comment',
      tags: '5-10 hashtags: avoid banned tags, mix popularity levels',
      keywords: 'Natural language, avoid keyword stuffing'
    }
  };

  const rules = platformRules[args.platform];

  const prompt = `You are an expert ${args.platform} SEO optimizer. Optimize this content for maximum discoverability.

**Original:**
Title: ${args.title}
Description: ${args.description}
Niche: ${args.niche}
${args.targetAudience ? `Target Audience: ${args.targetAudience}` : ''}

**Platform Rules (${args.platform}):**
- Title: ${rules.titleLength}
- Description: ${rules.descriptionLength}
- Tags: ${rules.tags}
- Keyword Strategy: ${rules.keywords}

Return JSON:
{
  "optimizedTitle": "New SEO-optimized title",
  "optimizedDescription": "Keyword-rich description with CTA",
  "tags": ["tag1", "tag2", "tag3"],
  "primaryKeyword": "main keyword",
  "secondaryKeywords": ["keyword2", "keyword3"],
  "improvements": [
    "What changed and why (e.g., 'Added primary keyword to first 5 words')"
  ],
  "seoScore": 85,
  "estimatedImprovement": "+25% impressions, +15% CTR",
  "competitorAnalysis": {
    "topCompetitors": ["Channel 1", "Channel 2"],
    "gapOpportunities": ["Underserved keyword: 'X tutorial for beginners'"]
  }
}

Critical:
- Title MUST include primary keyword in first 5 words
- Description MUST have CTA (like, subscribe, comment)
- ${args.platform === 'youtube' ? 'Add timestamps if tutorial/how-to' : ''}
- ${args.platform === 'tiktok' ? 'Include trending hashtag + question to boost comments' : ''}

Optimize now.`;

  logWithTrace(traceId, 'info', 'Optimizing SEO', { platform: args.platform, niche: args.niche });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const optimized = jsonMatch ? JSON.parse(jsonMatch[0]) : {};

  logWithTrace(traceId, 'info', 'SEO optimized', { seoScore: optimized.seoScore });

  return optimized;
}

async function generateThumbnailConcepts(args: z.infer<typeof GenerateThumbnailArgsSchema>, traceId: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not found');
  }

  const gemini = new GoogleGenerativeAI(apiKey);
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const prompt = `Generate 5 high-CTR thumbnail concepts for this ${args.platform} video.

**Video Title:** ${args.title}
${args.niche ? `**Niche:** ${args.niche}` : ''}
${args.style ? `**Preferred Style:** ${args.style}` : ''}

Return JSON array:
[
  {
    "conceptId": 1,
    "style": "bold-text",
    "visualDescription": "Bright red background, white sans-serif text '${args.title.slice(0, 30)}...', shocked face bottom-right",
    "colorPalette": ["#FF0000", "#FFFFFF", "#000000"],
    "textOverlay": "3-5 WORDS MAX",
    "faceExpression": "shocked/curious/excited/none",
    "composition": "Rule of thirds: text left, face right",
    "contrastScore": 95,
    "clickabilityScore": 88,
    "aiImagePrompt": "Photorealistic thumbnail for YouTube: bright red background, bold white text '${args.title.slice(0, 20)}', person with shocked expression bottom right corner, high contrast, 16:9 aspect ratio",
    "abTestHypothesis": "Red backgrounds outperform blue by 12% in tech niche"
  }
]

**Thumbnail Best Practices:**
- ${args.platform === 'youtube' ? '1280x720px, faces should be 40%+ of frame' : ''}
- ${args.platform === 'tiktok' ? 'Vertical 9:16, text readable on mobile' : ''}
- High contrast (use complementary colors)
- Text: 3-5 words MAX, sans-serif, 80pt+
- Faces: expressive emotions (shock, curiosity, excitement)
- Avoid clickbait (platform will demote)
- Include ONE focal point (not cluttered)

Generate 5 diverse concepts with different styles.`;

  logWithTrace(traceId, 'info', 'Generating thumbnail concepts', { title: args.title });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const concepts = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

  logWithTrace(traceId, 'info', 'Thumbnail concepts generated', { count: concepts.length });

  return {
    concepts,
    abTestRecommendation: 'Test top 2 concepts for 48 hours, keep winner',
    toolSuggestions: ['Canva', 'Photoshop', 'Figma', 'Midjourney (for AI generation)']
  };
}

async function optimizePostingSchedule(args: z.infer<typeof OptimizeScheduleArgsSchema>, traceId: string) {
  logWithTrace(traceId, 'info', 'Optimizing posting schedule', { platform: args.platform, timezone: args.timezone });

  // Platform-specific best times (baseline data)
  const baselineTimes = {
    youtube: ['14:00', '17:00', '20:00'], // 2pm, 5pm, 8pm
    tiktok: ['07:00', '12:00', '19:00'], // 7am, 12pm, 7pm
    instagram: ['11:00', '13:00', '19:00'], // 11am, 1pm, 7pm
    twitter: ['08:00', '12:00', '17:00'] // 8am, 12pm, 5pm
  };

  let optimalTimes = baselineTimes[args.platform];

  // Analyze historical performance if provided
  if (args.historicalPerformance && args.historicalPerformance.length > 0) {
    const performanceByHour: Record<number, { views: number; engagement: number; count: number }> = {};

    args.historicalPerformance.forEach(post => {
      const hour = new Date(post.postTime).getHours();
      if (!performanceByHour[hour]) {
        performanceByHour[hour] = { views: 0, engagement: 0, count: 0 };
      }
      performanceByHour[hour].views += post.views;
      performanceByHour[hour].engagement += post.engagement;
      performanceByHour[hour].count += 1;
    });

    // Find top 3 performing hours
    const topHours = Object.entries(performanceByHour)
      .map(([hour, data]) => ({
        hour: parseInt(hour),
        avgViews: data.views / data.count,
        avgEngagement: data.engagement / data.count
      }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 3);

    optimalTimes = topHours.map(h => `${h.hour.toString().padStart(2, '0')}:00`);

    logWithTrace(traceId, 'info', 'Analyzed historical data', { topHours });
  }

  return {
    platform: args.platform,
    timezone: args.timezone,
    optimalPostingTimes: optimalTimes.map(time => ({
      time,
      dayOfWeek: args.platform === 'youtube' ? 'Thursday/Friday' : 'Tuesday/Wednesday',
      reason: 'Peak audience activity based on analytics'
    })),
    frequency: args.platform === 'youtube' ? '2-3 videos/week' : args.platform === 'tiktok' ? '1-3 videos/day' : '1 post/day',
    avoidTimes: ['02:00-06:00 (low activity)', 'During major events (unless relevant)'],
    seasonalNotes: 'Summer: -15% engagement. Holiday season: +30% engagement.',
    recommendation: `Post on ${optimalTimes[0]} ${args.timezone} for maximum reach.`
  };
}

async function repurposeContent(args: z.infer<typeof RepurposeContentArgsSchema>, traceId: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not found');
  }

  const gemini = new GoogleGenerativeAI(apiKey);
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const prompt = `Repurpose this long-form video transcript into ${args.targetPlatforms.length} platforms of short-form clips.

**Original Transcript (${args.videoDuration}s):**
${args.videoTranscript}

**Target Platforms:** ${args.targetPlatforms.join(', ')}
**Clip Duration:** ${args.clipDuration}s each

Return JSON:
{
  "clips": [
    {
      "clipId": 1,
      "platform": "tiktok",
      "startTime": "00:15",
      "endTime": "00:45",
      "duration": 30,
      "hook": "Did you know...",
      "title": "Catchy clip title",
      "transcript": "Exact words from original (${args.clipDuration}s worth)",
      "viralScore": 85,
      "callToAction": "Watch full video (link in bio)",
      "editingNotes": "Add zoom effect at 0:05, text overlay for key stat"
    }
  ]
}

**Requirements:**
- Extract 10-15 clips from original
- Each clip MUST have a strong hook (first 3 seconds)
- Clips should be self-contained (no "as I mentioned before")
- Prioritize high-energy moments, statistics, surprising facts
- ${args.targetPlatforms.includes('tiktok') ? 'TikTok clips: viral potential 70+' : ''}
- Include call-to-action to watch full video

Extract clips now.`;

  logWithTrace(traceId, 'info', 'Repurposing content', { duration: args.videoDuration, platforms: args.targetPlatforms.length });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const repurposed = jsonMatch ? JSON.parse(jsonMatch[0]) : { clips: [] };

  logWithTrace(traceId, 'info', 'Content repurposed', { clips: repurposed.clips.length });

  return repurposed;
}

async function runABTest(args: z.infer<typeof RunABTestArgsSchema>, traceId: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not found');
  }

  const gemini = new GoogleGenerativeAI(apiKey);
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const prompt = `Generate ${args.variants} A/B test variants for this ${args.element}.

**Original ${args.element}:**
${args.original}

**Platform:** ${args.platform}

Return JSON:
{
  "original": "${args.original}",
  "variants": [
    {
      "variantId": "A",
      "content": "Variant text/description",
      "hypothesis": "Why this might outperform (e.g., 'More curiosity gap')",
      "expectedImprovement": "+15% CTR",
      "riskLevel": "low/medium/high"
    }
  ],
  "testPlan": {
    "sampleSize": 1000,
    "duration": "48 hours",
    "successMetric": "${args.element === 'thumbnail' ? 'CTR' : args.element === 'title' ? 'CTR + Retention' : 'Engagement Rate'}",
    "statisticalSignificance": "95% confidence interval"
  }
}

**Variant Strategies:**
${args.element === 'thumbnail' ? '- Test colors (warm vs cool), face vs no-face, text placement' : ''}
${args.element === 'title' ? '- Test question vs statement, numbers vs no-numbers, emotional words' : ''}
${args.element === 'hook' ? '- Test curiosity gap, shock value, direct benefit statement' : ''}

Generate variants now.`;

  logWithTrace(traceId, 'info', 'Running A/B test', { element: args.element, variants: args.variants });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const abTest = jsonMatch ? JSON.parse(jsonMatch[0]) : { variants: [] };

  logWithTrace(traceId, 'info', 'A/B test variants generated', { count: abTest.variants?.length || 0 });

  return abTest;
}

async function main() {
  const server = new Server(
    {
      name: 'growth-optimizer-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: GROWTH_OPTIMIZER_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const traceId = createTraceId();

    try {
      if (request.params.name === 'optimize_seo') {
        const args = OptimizeSEOArgsSchema.parse(request.params.arguments);
        const result = await optimizeSEO(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      if (request.params.name === 'generate_thumbnail_concepts') {
        const args = GenerateThumbnailArgsSchema.parse(request.params.arguments);
        const result = await generateThumbnailConcepts(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      if (request.params.name === 'optimize_posting_schedule') {
        const args = OptimizeScheduleArgsSchema.parse(request.params.arguments);
        const result = await optimizePostingSchedule(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      if (request.params.name === 'repurpose_content') {
        const args = RepurposeContentArgsSchema.parse(request.params.arguments);
        const result = await repurposeContent(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      if (request.params.name === 'run_ab_test') {
        const args = RunABTestArgsSchema.parse(request.params.arguments);
        const result = await runABTest(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
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

  logger.info('Growth Optimizer MCP Server running on stdio');
}

main().catch((error) => {
  logger.error('Fatal error', { error });
  process.exit(1);
});
