'use client';

import { useEffect, useMemo, useState } from 'react';
import { objectApi, subscribeCacheInvalidation } from '@/lib/tauri';
import { useProfileStore } from '@/store/profileStore';

const CACHE_TTL_MS = 60_000;
const MAX_FOLDERS = 100;

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

// Session cache keyed by profile/bucket/prefix. Folder timestamps are derived
// with extra S3 requests, so reuse them while the user moves between views.
const timestampCache = new Map<string, CacheEntry>();

export interface FolderTimestampsResult {
  timestamps: Record<string, string | null>;
  isLoading: boolean;
}

export function useFolderTimestamps(
  bucketName: string | null | undefined,
  bucketRegion: string | null | undefined,
  folders: string[],
  enabled = true
): FolderTimestampsResult {
  const profileId = useProfileStore((state) => state.activeProfileId);
  const [timestamps, setTimestamps] = useState<Record<string, string | null>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(
    () =>
      subscribeCacheInvalidation((scope) => {
        if (scope === 'objects') {
          timestampCache.clear();
          setRefreshToken((token) => token + 1);
        }
      }),
    []
  );

  // Folders is a fresh array on most renders; the key keeps the effect stable
  // while still reacting to the visible folder set.
  const foldersKey = useMemo(
    () => `${folders.length}:${folders.slice(0, MAX_FOLDERS).join('\n')}`,
    [folders]
  );

  useEffect(() => {
    if (!enabled || !bucketName || !profileId) {
      setTimestamps({});
      return;
    }

    const visible = folders.slice(0, MAX_FOLDERS);
    if (visible.length === 0) {
      setTimestamps({});
      return;
    }

    const now = Date.now();
    const resolved: Record<string, string | null> = {};
    const missing: string[] = [];

    for (const prefix of visible) {
      const cached = timestampCache.get(`${profileId}|${bucketName}|${prefix}`);
      if (cached && cached.expiresAt > now) {
        resolved[prefix] = cached.value;
      } else {
        missing.push(prefix);
      }
    }

    setTimestamps(resolved);
    if (missing.length === 0) return;

    let cancelled = false;
    setIsLoading(true);

    objectApi
      .getPrefixTimestamps(bucketName, bucketRegion ?? undefined, missing, profileId)
      .then((results) => {
        if (cancelled) return;
        const patch: Record<string, string | null> = {};
        const expiresAt = Date.now() + CACHE_TTL_MS;
        for (const result of results) {
          patch[result.prefix] = result.last_modified;
          timestampCache.set(`${profileId}|${bucketName}|${result.prefix}`, {
            value: result.last_modified,
            expiresAt,
          });
        }
        setTimestamps((previous) => ({ ...previous, ...patch }));
      })
      .catch(() => {
        // Timestamps are optional; the listing itself is still usable.
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- foldersKey captures the folder set
  }, [enabled, profileId, bucketName, bucketRegion, foldersKey, refreshToken]);

  return { timestamps, isLoading };
}
