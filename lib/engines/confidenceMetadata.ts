/**
 * Confidence metadata for conversation responses.
 * Metadata only - no gating of answers or results.
 */
export type ConfidenceMetadataInput = {
  aiSource: 'openai' | 'disabled' | 'budget' | 'error' | null;
  hasErrorPrompt?: boolean;
  needsClarification?: boolean;
};

export type ConfidenceMetadata = {
  assistantConfidence: number;
};

/**
 * Compute confidence metadata from AI source and context.
 * Metadata only - does not gate or hide answers.
 */
export function computeConfidenceMetadata(args: ConfidenceMetadataInput): ConfidenceMetadata {
  const { aiSource, hasErrorPrompt, needsClarification } = args;
  let assistantConfidence: number;
  if (hasErrorPrompt) assistantConfidence = 0.62;
  else if (aiSource === 'openai') assistantConfidence = needsClarification ? 0.83 : 0.9;
  else if (aiSource === 'budget') assistantConfidence = needsClarification ? 0.72 : 0.79;
  else if (aiSource === 'error') assistantConfidence = needsClarification ? 0.68 : 0.75;
  else assistantConfidence = needsClarification ? 0.7 : 0.78;
  return { assistantConfidence };
}
