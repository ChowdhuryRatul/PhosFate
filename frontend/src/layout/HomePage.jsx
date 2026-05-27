import { useEffect, useState } from "react";
import "../PhosFate.css";
import AnionPDBPage from "./pages/AnionPDBPage";
import PhosFatePage from "./pages/PhosFatePage";

const pagePath = {
  anion: "/home",
  phosfate: "/PhosFate",
};

const getPageFromLocation = () => {
  const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, "");
  const hash = window.location.hash.toLowerCase();

  if (pathname === "/phosfate" || hash === "#phosfate") {
    return "phosfate";
  }

  return "anion";
};

export default function HomePage() {
  const [page, setPage] = useState(getPageFromLocation);

  useEffect(() => {
    document.body.classList.toggle("page-anion", page === "anion");
    document.body.classList.toggle("page-phosfate", page === "phosfate");

    const nextPath = pagePath[page];
    if (window.location.pathname !== nextPath || window.location.hash) {
      window.history.replaceState(null, "", nextPath);
    }
  }, [page]);

  useEffect(() => {
    const handleLocationChange = () => {
      setPage(getPageFromLocation());
    };

    window.addEventListener("popstate", handleLocationChange);
    window.addEventListener("hashchange", handleLocationChange);
    return () => {
      window.removeEventListener("popstate", handleLocationChange);
      window.removeEventListener("hashchange", handleLocationChange);
    };
  }, []);

  return page === "anion" ? (
    <AnionPDBPage setPage={setPage} />
  ) : (
    <PhosFatePage setPage={setPage} />
  );
}
