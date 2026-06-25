import { useEffect, useState } from "react";
import "../PhosFate.css";
import AnionPDBPage from "./pages/AnionPDBPage";
import HistoryPage from "./pages/HistoryPage";
import PhosFatePage from "./pages/PhosFatePage";

const pagePath = {
  anion: "/home",
  phosfate: "/PhosFate",
  history: "/History",
};

const getPageFromLocation = () => {
  const pathname = window.location.pathname.toLowerCase().replace(/\/+$/, "");
  const hash = window.location.hash.toLowerCase();

  if (pathname === "/phosfate" || hash === "#phosfate") {
    return "phosfate";
  }
  if (pathname === "/history" || hash === "#history") {
    return "history";
  }

  return "anion";
};

export default function HomePage() {
  const [page, setPage] = useState(getPageFromLocation);

  useEffect(() => {
    document.body.classList.toggle("page-anion", page === "anion");
    document.body.classList.toggle("page-phosfate", page === "phosfate");
    document.body.classList.toggle("page-history", page === "history");

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

  if (page === "phosfate") {
    return <PhosFatePage setPage={setPage} />;
  }

  if (page === "history") {
    return <HistoryPage setPage={setPage} />;
  }

  return <AnionPDBPage setPage={setPage} />;
}
