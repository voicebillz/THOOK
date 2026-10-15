import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Header, Footer } from "./components/Header";
import { Loader } from "./components/Loader";
import Home from "./pages/Home";
import Stats from "./pages/Stats";
import Token from "./pages/Token";

const Admin = lazy(() => import("./pages/Admin"));

function Page({ children }: { children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div initial={reduce ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={reduce ? undefined : { opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}>
      {children}
    </motion.div>
  );
}

export default function App() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <Loader />
      <Header />
      <main id="main">
        <AnimatePresence mode="wait">
          <Routes location={loc} key={loc.pathname}>
            <Route path="/" element={<Page><Home /></Page>} />
            <Route path="/stats" element={<Page><Stats /></Page>} />
            <Route path="/thook" element={<Page><Token /></Page>} />
            <Route path="/admin" element={<Page><Suspense fallback={<div className="page wrap"><span className="sk" style={{ width: 200, height: 40 }} /></div>}><Admin /></Suspense></Page>} />
            <Route path="*" element={<Page><div className="page wrap"><h1 className="page-title">Off the hook.</h1><p className="page-intro">That page doesn't exist.</p></div></Page>} />
          </Routes>
        </AnimatePresence>
      </main>
      <Footer />
    </>
  );
}
