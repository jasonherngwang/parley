export interface ParsedPRUrl {
  owner: string;
  repo: string;
  number: number;
}

export interface PRMetadata {
  title: string;
  repoName: string;
  diff: string;
  lineCount: number;
}

export function parseGitHubPRUrl(url: string): ParsedPRUrl {
  const match = url.match(
    /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)\/?$/
  );
  if (!match) {
    throw new Error(
      'Invalid GitHub PR URL. Expected: https://github.com/{owner}/{repo}/pull/{number}'
    );
  }
  return {
    owner: match[1],
    repo: match[2],
    number: parseInt(match[3], 10),
  };
}

export async function fetchPRFiles(
  owner: string,
  repo: string,
  number: number
): Promise<PRMetadata> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'parley-code-review/1.0',
  };
  if (process.env.GITHUB_TOKEN) {
    headers['Authorization'] = `Bearer ${process.env.GITHUB_TOKEN}`;
  }

  const [prResponse, filesResponse] = await Promise.all([
    fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${number}`, {
      headers,
    }),
    fetch(
      `https://api.github.com/repos/${owner}/${repo}/pulls/${number}/files`,
      { headers }
    ),
  ]);

  if (!prResponse.ok) {
    if (prResponse.status === 404) {
      throw new Error(
        `PR not found or repository is private: ${owner}/${repo}#${number}`
      );
    }
    throw new Error(
      `GitHub API error: ${prResponse.status} ${prResponse.statusText}`
    );
  }

  if (!filesResponse.ok) {
    if (filesResponse.status === 404) {
      throw new Error(`PR files not found: ${owner}/${repo}#${number}`);
    }
    throw new Error(
      `GitHub API error for files: ${filesResponse.status} ${filesResponse.statusText}`
    );
  }

  const prData = await prResponse.json() as { title: string };
  const filesData = await filesResponse.json() as Array<{ filename: string; patch?: string }>;

  const title: string = prData.title;
  const repoName = `${owner}/${repo}`;

  // Build unified diff from file patches
  const diffParts: string[] = [];
  for (const file of filesData) {
    if (file.patch) {
      diffParts.push(
        `--- a/${file.filename}\n+++ b/${file.filename}\n${file.patch}`
      );
    }
  }

  const diff = diffParts.join('\n');
  const lineCount = diff.split('\n').length;

  return { title, repoName, diff, lineCount };
}
