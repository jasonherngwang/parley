import { describe, it, expect } from 'vitest';
import { parseGitHubPRUrl } from '../lib/github';

describe('parseGitHubPRUrl', () => {
  it('parses a valid GitHub PR URL', () => {
    const result = parseGitHubPRUrl('https://github.com/facebook/react/pull/123');
    expect(result).toEqual({ owner: 'facebook', repo: 'react', number: 123 });
  });

  it('parses URL with trailing slash', () => {
    const result = parseGitHubPRUrl('https://github.com/owner/repo/pull/456/');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', number: 456 });
  });

  it('parses URL with http scheme', () => {
    const result = parseGitHubPRUrl('http://github.com/owner/repo/pull/1');
    expect(result).toEqual({ owner: 'owner', repo: 'repo', number: 1 });
  });

  it('throws on non-PR GitHub URL', () => {
    expect(() => parseGitHubPRUrl('https://github.com/owner/repo')).toThrow(
      'Invalid GitHub PR URL'
    );
  });

  it('throws on issues URL', () => {
    expect(() =>
      parseGitHubPRUrl('https://github.com/owner/repo/issues/123')
    ).toThrow('Invalid GitHub PR URL');
  });

  it('throws on gitlab.com URL', () => {
    expect(() =>
      parseGitHubPRUrl('https://gitlab.com/owner/repo/pull/123')
    ).toThrow('Invalid GitHub PR URL');
  });

  it('throws on empty string', () => {
    expect(() => parseGitHubPRUrl('')).toThrow('Invalid GitHub PR URL');
  });

  it('throws on URL without PR number', () => {
    expect(() =>
      parseGitHubPRUrl('https://github.com/owner/repo/pull/')
    ).toThrow('Invalid GitHub PR URL');
  });
});
