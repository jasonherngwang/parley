import { ApplicationFailure, heartbeat } from '@temporalio/activity';
import { parseGitHubPRUrl, fetchPRFiles } from '../../../lib/github';

export interface PRDiffResult {
  title: string;
  repoName: string;
  prNumber: number;
  diff: string;
  submitterContext: string;
}

const MAX_LINE_COUNT = 500;

export async function fetchGitHubPRDiff(args: {
  prUrl: string;
  context?: string;
}): Promise<PRDiffResult> {
  heartbeat('Parsing PR URL...');

  const parsed = parseGitHubPRUrl(args.prUrl);

  heartbeat('Fetching PR files from GitHub...');

  const { title, repoName, diff, lineCount } = await fetchPRFiles(
    parsed.owner,
    parsed.repo,
    parsed.number
  );

  if (lineCount > MAX_LINE_COUNT) {
    throw ApplicationFailure.nonRetryable(
      `Diff too large: ${lineCount} lines (max ${MAX_LINE_COUNT}). Please submit a smaller PR.`,
      'DiffTooLarge'
    );
  }

  return {
    title,
    repoName,
    prNumber: parsed.number,
    diff,
    submitterContext: args.context ?? '',
  };
}
