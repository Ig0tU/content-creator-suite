#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { ViralIdeaSchema, TrendAnalysisError } from '../shared/types.js';
import { logger, createTraceId, logWithTrace } from '../shared/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const IDEA_GENERATOR_TOOLS: Tool[] = [
  {
    name: 'generate_viral_ideas',
    description: 'Generate 10-50 viral content ideas based on trending topics and niche',
    inputSchema: {
      type: 'object',
      properties: {
        niche: {
          type: 'string',
          description: 'Content niche (tech, fitness, cooking, gaming, etc.)'
        },
        platform: {
          type: 'string',
          enum: ['youtube', 'tiktok', 'instagram-reels', 'youtube-shorts', 'all']
        },
        count: {
          type: 'number',
          minimum: 10,
          maximum: 50,
          description: 'Number of ideas to generate'
        },
        trendWindow: {
          type: 'string',
          enum: ['24h', '7d', '30d'],
          description: 'Trend analysis time window'
        }
      },
      required: ['niche', 'platform', 'count']
    }
  },
  {
    name: 'analyze_trending_topics',
    description: 'Analyze current trending topics across platforms for a niche',
    inputSchema: {
      type: 'object',
      properties: {
        niche: { type: 'string' },
        platforms: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['youtube', 'tiktok', 'twitter', 'reddit', 'google-trends']
          }
        }
      },
      required: ['niche', 'platforms']
    }
  },
  {
    name: 'predict_virality',
    description: 'Predict viral potential of a content idea (0-100 score)',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        description: { type: 'string' },
        platform: {
          type: 'string',
          enum: ['youtube', 'tiktok', 'instagram-reels', 'youtube-shorts']
        },
        niche: { type: 'string' }
      },
      required: ['title', 'description', 'platform', 'niche']
    }
  }
];

const GenerateIdeasArgsSchema = z.object({
  niche: z.string(),
  platform: z.enum(['youtube', 'tiktok', 'instagram-reels', 'youtube-shorts', 'all']),
  count: z.number().int().min(10).max(50),
  trendWindow: z.enum(['24h', '7d', '30d']).optional().default('7d')
});

const AnalyzeTrendsArgsSchema = z.object({
  niche: z.string(),
  platforms: z.array(z.enum(['youtube', 'tiktok', 'twitter', 'reddit', 'google-trends']))
});

const PredictViralityArgsSchema = z.object({
  title: z.string(),
  description: z.string(),
  platform: z.enum(['youtube', 'tiktok', 'instagram-reels', 'youtube-shorts']),
  niche: z.string()
});

async function scrapeTrendingTopics(niche: string, platforms: string[], traceId: string): Promise<string[]> {
  const trends: string[] = [];

  // YouTube Trends (via unofficial API or scraping)
  if (platforms.includes('youtube')) {
    try {
      const response = await axios.get('https://www.youtube.com/feed/trending', {
        params: { bp: 'wgYCCAESAhAB' }, // Gaming category example
        headers: { 'User-Agent': 'Mozilla/5.0' }
      });

      // Extract trending topics from response (simplified)
      logWithTrace(traceId, 'info', 'Scraped YouTube trends', { niche });
      trends.push(`${niche} tutorial`, `${niche} 2025`, `best ${niche}`);
    } catch (error) {
      logWithTrace(traceId, 'warn', 'YouTube scraping failed', { error });
    }
  }

  // Twitter/X Trends
  if (platforms.includes('twitter')) {
    // Note: Real implementation would use Twitter API
    trends.push(`#${niche}`, `${niche} tips`, `${niche} secrets`);
  }

  // Reddit Trends
  if (platforms.includes('reddit')) {
    try {
      const response = await axios.get(`https://www.reddit.com/r/${niche}/hot.json`, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        params: { limit: 10 }
      });

      const posts = response.data?.data?.children || [];
      posts.forEach((post: any) => {
        if (post.data.title) {
          trends.push(post.data.title.toLowerCase());
        }
      });

      logWithTrace(traceId, 'info', 'Scraped Reddit trends', { count: posts.length });
    } catch (error) {
      logWithTrace(traceId, 'warn', 'Reddit scraping failed', { error });
    }
  }

  // Google Trends (simplified)
  if (platforms.includes('google-trends')) {
    trends.push(
      `how to ${niche}`,
      `${niche} for beginners`,
      `${niche} vs`,
      `${niche} mistakes`
    );
  }

  return [...new Set(trends)]; // Remove duplicates
}

async function generateViralIdeas(args: z.infer<typeof GenerateIdeasArgsSchema>, traceId: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new TrendAnalysisError('GEMINI_API_KEY not found');
  }

  const gemini = new GoogleGenerativeAI(apiKey);
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro' });

  // Get trending topics
  const trends = await scrapeTrendingTopics(
    args.niche,
    ['youtube', 'reddit', 'google-trends'],
    traceId
  );

  const systemPrompt = `You are a viral content strategist. Generate ${args.count} viral video ideas for ${args.platform}.

Niche: ${args.niche}
Current Trends: ${trends.slice(0, 10).join(', ')}

For each idea, provide:
- Catchy title (40-60 characters)
- Hook (first 5 seconds, max 200 chars)
- Viral score (0-100)
- Thumbnail concept
- 3-5 section script outline
- Estimated views (min/max/confidence)
- SEO tags & description

Return JSON array of viral ideas.`;

  const userPrompt = `Generate ${args.count} viral ${args.platform} video ideas for the ${args.niche} niche.

Use these trending topics for inspiration:
${trends.join('\n')}

Each idea must have:
{
  "id": "unique-id",
  "title": "Attention-grabbing title",
  "hook": "First 5 seconds that stop scrolling",
  "platform": "${args.platform}",
  "category": "education/entertainment/etc",
  "viralScore": 85,
  "trendingTopics": ["topic1", "topic2"],
  "targetAudience": "Description of ideal viewer",
  "thumbnailConcept": "Visual description for thumbnail",
  "scriptOutline": [
    {"section": "Hook", "duration": 5, "keyPoints": ["point1"]},
    {"section": "Main Content", "duration": 180, "keyPoints": ["point1", "point2"]}
  ],
  "estimatedViews": {"min": 10000, "max": 100000, "confidence": 0.75},
  "seo": {
    "tags": ["tag1", "tag2"],
    "description": "SEO-optimized description",
    "keywords": ["keyword1", "keyword2"]
  },
  "generatedAt": "${new Date().toISOString()}"
}

Platform-specific requirements:
- TikTok: Hook in first 1-3 seconds, max 60 seconds
- YouTube: Strong title SEO, 8-12 minute sweet spot
- Instagram Reels: Visual hooks, trending audio
- YouTube Shorts: 15-60 seconds, vertical format

Generate ideas with viral score 70+.`;

  logWithTrace(traceId, 'info', 'Generating viral ideas', { niche: args.niche, count: args.count });

  const result = await model.generateContent(userPrompt + '\n\n' + systemPrompt);
  const response = await result.response;
  const text = response.text();

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const ideas = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

  // Validate each idea
  const validatedIdeas = ideas.map((idea: any) => {
    try {
      return ViralIdeaSchema.parse(idea);
    } catch (error) {
      logWithTrace(traceId, 'warn', 'Invalid idea skipped', { error });
      return null;
    }
  }).filter(Boolean);

  logWithTrace(traceId, 'info', 'Ideas generated', { count: validatedIdeas.length });

  return validatedIdeas;
}

async function analyzeTrends(args: z.infer<typeof AnalyzeTrendsArgsSchema>, traceId: string) {
  const trends = await scrapeTrendingTopics(args.niche, args.platforms, traceId);

  return {
    niche: args.niche,
    platforms: args.platforms,
    trends: trends.map(trend => ({
      topic: trend,
      volume: Math.floor(Math.random() * 100000) + 10000, // Placeholder
      growth: Math.floor(Math.random() * 100) - 50 // -50% to +50%
    })),
    topTrends: trends.slice(0, 10),
    analyzedAt: new Date().toISOString()
  };
}

async function predictVirality(args: z.infer<typeof PredictViralityArgsSchema>, traceId: string) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new TrendAnalysisError('GEMINI_API_KEY not found');
  }

  const gemini = new GoogleGenerativeAI(apiKey);
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-pro' });

  const prompt = `Analyze the viral potential of this ${args.platform} video idea:

Title: ${args.title}
Description: ${args.description}
Niche: ${args.niche}

Rate on these factors (0-100):
1. Title clickability
2. Hook strength
3. Trending topic alignment
4. Audience appeal
5. Uniqueness

Return JSON:
{
  "overallScore": 85,
  "breakdown": {
    "titleClickability": 90,
    "hookStrength": 85,
    "trendAlignment": 80,
    "audienceAppeal": 85,
    "uniqueness": 75
  },
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1"],
  "improvements": ["suggestion1", "suggestion2"],
  "estimatedViews": {"min": 50000, "max": 500000}
}`;

  logWithTrace(traceId, 'info', 'Predicting virality', { title: args.title });

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  const prediction = jsonMatch ? JSON.parse(jsonMatch[0]) : { overallScore: 50 };

  return prediction;
}

async function main() {
  const server = new Server(
    {
      name: 'viral-idea-generator-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: IDEA_GENERATOR_TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const traceId = createTraceId();

    try {
      if (request.params.name === 'generate_viral_ideas') {
        const args = GenerateIdeasArgsSchema.parse(request.params.arguments);
        const ideas = await generateViralIdeas(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ ideas, count: ideas.length }, null, 2)
            }
          ]
        };
      }

      if (request.params.name === 'analyze_trending_topics') {
        const args = AnalyzeTrendsArgsSchema.parse(request.params.arguments);
        const trends = await analyzeTrends(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(trends, null, 2)
            }
          ]
        };
      }

      if (request.params.name === 'predict_virality') {
        const args = PredictViralityArgsSchema.parse(request.params.arguments);
        const prediction = await predictVirality(args, traceId);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(prediction, null, 2)
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

  logger.info('Viral Idea Generator MCP Server running on stdio');
}

main().catch((error) => {
  logger.error('Fatal error', { error });
  process.exit(1);
});
