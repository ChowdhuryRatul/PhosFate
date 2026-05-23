import { useEffect, useState } from "react";
import "../PhosFate.css";
import AnionPDBPage from "./pages/AnionPDBPage";
import PhosFatePage from "./pages/PhosFatePage";

export default function HomePage() {
  const [page, setPage] = useState(() =>
    window.location.hash === "#phosfate" ? "phosfate" : "anion",
  );

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
      setPage(window.location.hash === "#phosfate" ? "phosfate" : "anion");
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
