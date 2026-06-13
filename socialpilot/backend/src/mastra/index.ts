/**
 * Mastra — AI pipeline orchestration entry point.
 *
 * Exports all workflows for use by BullMQ workers and provides
 * helper functions to execute any Mastra workflow from a job handler.
 *
 * Usage:
 *   import { runCommentPipeline, runDMPipeline } from '../../mastra';
 *   const result = await runCommentPipeline(job.data);
 */

import { commentPipeline } from './workflows/comment-pipeline';
import { dmPipeline } from './workflows/dm-pipeline';

export { commentPipeline, dmPipeline };

/**
 * Run the comment pipeline with a typed input payload.
 * Returns the final step's output (response, leadId, dealCreated, replyStatus).
 */
export interface CommentPipelineResult {
  response: string;
  leadId: string | null;
  dealCreated: boolean;
  replyStatus: string;
  updated: boolean;
  approvalId: string | null;
}

export async function runCommentPipeline(input: {
  commentId: string;
  userId: string;
  platform: string;
  authorId: string;
  authorName: string;
  content: string;
}): Promise<CommentPipelineResult> {
  const run = await commentPipeline.createRun();
  const result = await run.start({ inputData: input });

  if (result.status === 'success') {
    return result.result as CommentPipelineResult;
  }

  throw new Error(`Comment pipeline failed: ${result.status}`);
}

/**
 * Run the DM pipeline with a typed input payload.
 * Returns the final step's output (response, leadId, dealCreated).
 */
export interface DMPipelineResult {
  response: string;
  leadId: string | null;
  dealCreated: boolean;
  stored: boolean;
  semanticStored: boolean;
  approvalId: string | null;
}

export async function runDMPipeline(input: {
  conversationId: string;
  userId: string;
  platform: string;
  senderId: string;
  content: string;
}): Promise<DMPipelineResult> {
  const run = await dmPipeline.createRun();
  const result = await run.start({ inputData: input });

  if (result.status === 'success') {
    return result.result as DMPipelineResult;
  }

  throw new Error(`DM pipeline failed: ${result.status}`);
}
