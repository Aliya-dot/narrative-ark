import {
  useLocation,
  useNavigate,
  useParams as useRouterParams,
} from "react-router-dom";

export function useParams<T extends Record<string, string>>() {
  return useRouterParams() as T;
}

export function useRouter() {
  const navigate = useNavigate();
  return {
    push(href: string) {
      navigate(href);
    },
    replace(href: string) {
      navigate(href, { replace: true });
    },
    back() {
      navigate(-1);
    },
    forward() {
      navigate(1);
    },
    refresh() {
      window.location.reload();
    },
  };
}

export function useSearchParams() {
  return new URLSearchParams(useLocation().search);
}
