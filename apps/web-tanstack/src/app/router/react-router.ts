import { useCallback, useMemo } from "react";
import { useNavigate as useTanStackNavigate, useRouterState } from "@tanstack/react-router";

type NavigateOptions = {
  replace?: boolean;
};

function readSearchString() {
  if (typeof window === "undefined") return "";
  return window.location.search;
}

function readHashString() {
  if (typeof window === "undefined") return "";
  return window.location.hash;
}

export function useNavigate() {
  const navigate = useTanStackNavigate();

  return useCallback(
    (to: string | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        if (typeof window !== "undefined") {
          window.history.go(to);
        }
        return;
      }

      navigate({
        to: to as never,
        replace: options?.replace,
      });
    },
    [navigate],
  );
}

export function useLocation() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const search = useRouterState({ select: (state) => state.location.searchStr ?? "" });
  const hash = useRouterState({ select: (state) => state.location.hash ?? "" });

  return useMemo(
    () => ({
      pathname,
      search,
      hash,
    }),
    [hash, pathname, search],
  );
}

export function useParams<TParams extends Record<string, string | undefined> = Record<string, string | undefined>>() {
  const matches = useRouterState({ select: (state) => state.matches });

  return useMemo(() => {
    const merged: Record<string, string | undefined> = {};
    for (const match of matches) {
      Object.assign(merged, match.params as Record<string, string | undefined>);
    }
    return merged as TParams;
  }, [matches]);
}

export function useSearchParams() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const hash = useRouterState({ select: (state) => state.location.hash ?? "" });
  const navigate = useTanStackNavigate();

  const search = readSearchString();
  const params = useMemo(() => new URLSearchParams(search), [search]);

  const setSearchParams = useCallback(
    (
      next:
        | URLSearchParams
        | string
        | Record<string, string>
        | ((prev: URLSearchParams) => URLSearchParams | string | Record<string, string>),
      options?: NavigateOptions,
    ) => {
      const prev = new URLSearchParams(readSearchString());
      const resolved = typeof next === "function" ? next(prev) : next;

      let nextParams: URLSearchParams;

      if (resolved instanceof URLSearchParams) {
        nextParams = resolved;
      } else if (typeof resolved === "string") {
        nextParams = new URLSearchParams(resolved);
      } else {
        nextParams = new URLSearchParams();
        for (const [key, value] of Object.entries(resolved)) {
          nextParams.set(key, value);
        }
      }

      const query = nextParams.toString();
      const to = query ? `${pathname}?${query}${hash}` : `${pathname}${hash}`;

      navigate({ to: to as never, replace: options?.replace });
    },
    [hash, navigate, pathname],
  );

  return [params, setSearchParams] as const;
}
