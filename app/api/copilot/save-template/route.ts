import { NextResponse } from 'next/server';
import { z } from 'zod';
import { saveRecordedTemplate } from '@/lib/copilot/service';

export const runtime = 'nodejs';

const SelectorSchema = z.object({
  testId: z.string().optional(),
  label: z.string().optional(),
  placeholder: z.string().optional(),
  css: z.string().optional(),
  xpath: z.string().optional(),
  text: z.string().optional(),
  role: z.string().optional(),
  name: z.string().optional(),
  id: z.string().optional(),
  inputType: z.string().optional(),
  tag: z.string().optional(),
});

const MotionSchema = z.object({
  stepId: z.string().max(120).optional(),
  pageKey: z.string().max(260).optional(),
  tabKey: z.string().max(120).optional(),
  anchor: z.string().max(260).optional(),
  clickPoint: z
    .object({
      xRatio: z.number().min(0).max(1),
      yRatio: z.number().min(0).max(1),
    })
    .optional(),
  timing: z
    .object({
      preDelayMs: z.number().int().min(0).max(6000).optional(),
      postDelayMs: z.number().int().min(0).max(6000).optional(),
    })
    .optional(),
  actionKind: z
    .enum(['click_only', 'type', 'select_open', 'select_option', 'upload', 'submit', 'scroll', 'goto'])
    .optional(),
  confirmationStatus: z.enum(['pending', 'confirmed']).optional(),
  reviewRequired: z.boolean().optional(),
  confidence: z.enum(['high', 'medium', 'low']).optional(),
  viewport: z
    .object({
      width: z.number().int().min(1).max(10000),
      height: z.number().int().min(1).max(10000),
      scrollX: z.number().int().min(-200000).max(200000),
      scrollY: z.number().int().min(-200000).max(200000),
    })
    .optional(),
  scrollMeta: z
    .object({
      startY: z.number().int().min(-200000).max(200000).optional(),
      endY: z.number().int().min(-200000).max(200000).optional(),
      deltaY: z.number().int().min(-200000).max(200000).optional(),
      semanticReason: z.enum(['reached_bottom', 'long_scroll', 'section_scroll', 'minor_scroll']).optional(),
    })
    .optional(),
  resolverMode: z.enum(['primary', 'semantic', 'fallback_contextual', 'guided_manual_resume']).optional(),
  targetHint: z.string().max(140).optional(),
});

const MacroSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('goto'), url: z.string().url(), waitUntil: z.enum(['load', 'networkidle']).optional() }),
  z.object({ type: z.literal('click'), target: SelectorSchema }).merge(MotionSchema),
  z.object({ type: z.literal('type'), target: SelectorSchema, valueFrom: z.string().min(1) }).merge(MotionSchema),
  z.object({ type: z.literal('select'), target: SelectorSchema, valueFrom: z.string().min(1) }).merge(MotionSchema),
  z.object({ type: z.literal('upload'), target: SelectorSchema, documentKey: z.string().min(1) }).merge(MotionSchema),
  z.object({ type: z.literal('scroll'), direction: z.enum(['up', 'down']), amount: z.number().int().positive().optional() }).merge(MotionSchema),
  z.object({ type: z.literal('waitFor'), target: SelectorSchema.optional(), timeoutMs: z.number().int().positive().optional() }),
  z.object({ type: z.literal('waitHuman'), message: z.string().min(1) }),
  z.object({ type: z.literal('assertUrl'), contains: z.string().min(1) }),
]);

const BodySchema = z.object({
  sessionId: z.string().uuid(),
  name: z.string().min(2).max(180),
  bandoKey: z.string().min(1).max(200),
  proceduraKey: z.string().min(1).max(200),
  domain: z.string().min(3).max(200),
  requiresFinalConfirmation: z.boolean().default(true),
  saveMode: z.enum(['new_version', 'overwrite']).default('new_version'),
  status: z.enum(['draft', 'active', 'inactive']).optional(),
  expectedDurationSeconds: z.number().int().positive().max(7200).optional(),
  recordedSteps: z.array(MacroSchema).min(1),
  fieldMapping: z.record(z.string(), z.string()).default({}),
});

export async function POST(request: Request) {
  try {
    const body = BodySchema.parse(await request.json());
    const data = await saveRecordedTemplate(body);
    return NextResponse.json({ ok: true, ...data });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : 'Salvataggio template fallito.' },
      { status: 500 }
    );
  }
}
