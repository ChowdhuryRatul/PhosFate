import { useEffect, useState } from "react";
import "../PhosFate.css";
import AnionPDBPage from "./pages/AnionPDBPage";
import PhosFatePage from "./pages/PhosFatePage";

const getPageFromHash = () => {
  if (window.location.hash === "#phosfate") {
    return "phosfate";
  }

  return "anion";
};

export default function HomePage() {
  const [page, setPage] = useState(getPageFromHash);

  useEffect(() => {
    document.body.classList.toggle("page-anion", page === "anion");
    document.body.classList.toggle("page-phosfate", page === "phosfate");
    window.history.replaceState(
      null,
      "",
      page === "phosfate" ? "#phosfate" : "#anion",
    );
  }, [page]);

  useEffect(() => {
    const handleHashChange = () => {
      setPage(getPageFromHash());
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return page === "anion" ? (
    <AnionPDBPage setPage={setPage} />
  ) : (
    <PhosFatePage setPage={setPage} />
  );
}
