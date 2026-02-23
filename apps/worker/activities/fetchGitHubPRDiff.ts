import { heartbeat } from '@temporalio/activity';
import { parseGitHubPRUrl, fetchPRFiles } from '../../../lib/github';

export interface PRDiffResult {
  title: string;
  repoName: string;
  prNumber: number;
  diff: string;
  submitterContext: string;
}

export async function fetchGitHubPRDiff(args: {
  prUrl: string;
  context?: string;
}): Promise<PRDiffResult> {
  heartbeat('Parsing PR URL...');

  const parsed = parseGitHubPRUrl(args.prUrl);

  heartbeat('Fetching PR files from GitHub...');

  const { title, repoName, diff } = await fetchPRFiles(
    parsed.owner,
    parsed.repo,
    parsed.number
  );

  return {
    title,
    repoName,
    prNumber: parsed.number,
    diff,
    submitterContext: args.context ?? '',
  };
}
