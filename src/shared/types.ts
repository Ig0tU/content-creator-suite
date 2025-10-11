import { z } from 'zod';

// Viral Content Idea Schema
export const ViralIdeaSchema = z.object({
  id: z.string(),
  title: z.string().min(10).max(100),
  hook: z.string().min(10).max(200),
  platform: z.enum(['youtube', 'tiktok', 'instagram-reels', 'youtube-shorts', 'all']),
  category: z.enum([
    'education',
    'entertainment',
    'comedy',
    'tutorial',
    'review',
    'vlog',
    'gaming',
    'lifestyle',
    'tech',
    'fitness'
  ]),
  viralScore: z.number().min(0).max(100),
  trendingTopics: z.array(z.string()),
  targetAudience: z.string(),
  thumbnailConcept: z.string(),
  scriptOutline: z.array(z.object({
    section: z.string(),
    duration: z.number(),
    keyPoints: z.array(z.string())
  })),
  estimatedViews: z.object({
    min: z.number(),
    max: z.number(),
    confidence: z.number()
  }),
  seo: z.object({
    tags: z.array(z.string()).max(30),
    description: z.string().max(500),
    keywords: z.array(z.string())
  }),
  generatedAt: z.string().datetime()
});

export type ViralIdea = z.infer<typeof ViralIdeaSchema>;

// Video Script Schema
export const VideoScriptSchema = z.object({
  id: z.string(),
  title: z.string(),
  platform: z.enum(['youtube', 'tiktok', 'instagram-reels', 'youtube-shorts']),
  duration: z.number().int().min(15).max(3600), // seconds
  segments: z.array(z.object({
    timestamp: z.string(),
    type: z.enum(['hook', 'intro', 'main', 'b-roll', 'transition', 'cta', 'outro']),
    visual: z.string(),
    audio: z.string(),
    voiceover: z.string(),
    onScreenText: z.string().optional(),
    musicCue: z.string().optional(),
    notes: z.string().optional()
  })),
  storyboard: z.array(z.object({
    shotNumber: z.number(),
    description: z.string(),
    cameraAngle: z.enum(['wide', 'medium', 'close-up', 'extreme-close-up', 'aerial']),
    shotType: z.enum(['static', 'pan', 'tilt', 'zoom', 'tracking']),
    duration: z.number()
  })),
  bRollList: z.array(z.object({
    description: z.string(),
    source: z.enum(['stock-footage', 'custom-shoot', 'screen-recording', 'animation']),
    timestamp: z.string()
  })),
  voiceoverScript: z.string(),
  captions: z.array(z.object({
    timestamp: z.string(),
    text: z.string()
  })),
  generatedAt: z.string().datetime()
});

export type VideoScript = z.infer<typeof VideoScriptSchema>;

// Channel Growth Metrics Schema
export const GrowthMetricsSchema = z.object({
  channelId: z.string(),
  platform: z.enum(['youtube', 'tiktok', 'instagram']),
  currentStats: z.object({
    subscribers: z.number(),
    views: z.number(),
    videos: z.number(),
    avgViewDuration: z.number(),
    engagement: z.number()
  }),
  projectedGrowth: z.object({
    subscribersIn30Days: z.number(),
    viewsIn30Days: z.number(),
    confidence: z.number()
  }),
  recommendations: z.array(z.object({
    category: z.enum(['content', 'seo', 'posting-schedule', 'thumbnail', 'engagement']),
    priority: z.enum(['high', 'medium', 'low']),
    action: z.string(),
    expectedImpact: z.string(),
    effort: z.enum(['low', 'medium', 'high'])
  })),
  optimalPostingTimes: z.array(z.object({
    dayOfWeek: z.string(),
    time: z.string(),
    timezone: z.string(),
    expectedReach: z.number()
  })),
  competitorAnalysis: z.array(z.object({
    channelName: z.string(),
    subscribers: z.number(),
    avgViews: z.number(),
    contentStrategy: z.string(),
    gapOpportunities: z.array(z.string())
  })),
  generatedAt: z.string().datetime()
});

export type GrowthMetrics = z.infer<typeof GrowthMetricsSchema>;

// Thumbnail Concept Schema
export const ThumbnailConceptSchema = z.object({
  id: z.string(),
  videoTitle: z.string(),
  layout: z.enum(['split-screen', 'text-overlay', 'face-closeup', 'action-shot', 'before-after']),
  primaryText: z.string().max(50),
  secondaryText: z.string().max(30).optional(),
  colorScheme: z.object({
    primary: z.string(),
    secondary: z.string(),
    accent: z.string()
  }),
  visualElements: z.array(z.object({
    type: z.enum(['face', 'text', 'icon', 'arrow', 'emoji', 'product']),
    description: z.string(),
    position: z.enum(['left', 'right', 'center', 'top', 'bottom'])
  })),
  emotionalTrigger: z.enum(['curiosity', 'shock', 'desire', 'fear', 'joy']),
  designNotes: z.string(),
  generatedAt: z.string().datetime()
});

export type ThumbnailConcept = z.infer<typeof ThumbnailConceptSchema>;

// Content Repurposing Schema
export const RepurposingPlanSchema = z.object({
  sourceVideo: z.object({
    id: z.string(),
    title: z.string(),
    duration: z.number(),
    platform: z.string()
  }),
  clips: z.array(z.object({
    clipNumber: z.number(),
    startTime: z.number(),
    endTime: z.number(),
    targetPlatform: z.enum(['tiktok', 'instagram-reels', 'youtube-shorts', 'twitter']),
    title: z.string(),
    description: z.string(),
    hashtags: z.array(z.string()),
    viralPotential: z.number()
  })),
  totalClips: z.number(),
  estimatedReach: z.number(),
  generatedAt: z.string().datetime()
});

export type RepurposingPlan = z.infer<typeof RepurposingPlanSchema>;

// Error Types
export class ContentCreatorError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ContentCreatorError';
  }
}

export class TrendAnalysisError extends ContentCreatorError {
  constructor(message: string, details?: unknown) {
    super(message, 'TREND_ANALYSIS_ERROR', details);
    this.name = 'TrendAnalysisError';
  }
}

export class ScriptGenerationError extends ContentCreatorError {
  constructor(message: string, details?: unknown) {
    super(message, 'SCRIPT_GENERATION_ERROR', details);
    this.name = 'ScriptGenerationError';
  }
}

export class GrowthOptimizationError extends ContentCreatorError {
  constructor(message: string, details?: unknown) {
    super(message, 'GROWTH_OPTIMIZATION_ERROR', details);
    this.name = 'GrowthOptimizationError';
  }
}
