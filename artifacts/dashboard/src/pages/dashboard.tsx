import React, { useState, useEffect, useRef } from "react";
import Layout from "@/components/layout";
import AdminSetupModal from "@/components/admin-setup-modal";

// Tabs
import SolverTab from "@/components/tabs/solver-tab";
import ExternalSolverTab from "@/components/tabs/external-solver-tab";
import OcrTab from "@/components/tabs/ocr-tab";
import GraphTab from "@/components/tabs/graph-tab";
import CalculatorTab from "@/components/tabs/calculator-tab";
import ChatTab from "@/components/tabs/chat-tab";
import QuizTab from "@/components/tabs/quiz-tab";
import GuideTab from "@/components/tabs/guide-tab";
import ResourcesTab from "@/components/tabs/resources-tab";
import HomeworkTab from "@/components/tabs/homework-tab";
import NovelsTab from "@/components/tabs/novels-tab";
import NotesTab from "@/components/tabs/notes-tab";
import SyllabusTab from "@/components/tabs/syllabus-tab";
import AdminTab from "@/components/tabs/admin-tab";
import PuzzlesTab from "@/components/tabs/puzzles-tab";
import SettingsTab from "@/components/tabs/settings-tab";
import ProgressTab from "@/components/tabs/progress-tab";
import SageMathTab from "@/components/tabs/sagemath-tab";
import MoodleTab from "@/components/tabs/moodle-tab";
import StudyHallTab from "@/components/tabs/study-hall-tab";
import CommunityTab from "@/components/tabs/community-tab";

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem("lastTab") || "external";
  });

  const tabHistory = useRef<string[]>([]);
  const isPopState = useRef(false);

  // Shared State across tabs
  const [solverQuestion, setSolverQuestion] = useState("");
  const [latestSolution, setLatestSolution] = useState("");

  // Admin setup modal from URL param
  const [adminSetupToken, setAdminSetupToken] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("admin_setup");
    if (token) {
      setAdminSetupToken(token);
      const clean = window.location.pathname;
      window.history.replaceState({}, "", clean);
    }
    // Capture referral code from URL and store for use during sign-up
    const ref = params.get("ref");
    if (ref?.trim()) {
      localStorage.setItem("pendingRefCode", ref.trim().toUpperCase());
      // Remove ?ref= from URL without reload
      params.delete("ref");
      if (token) params.delete("admin_setup");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, []);

  const handleSetActiveTab = (tab: string) => {
    localStorage.setItem("lastTab", tab);
    if (!isPopState.current) {
      tabHistory.current.push(activeTab);
      window.history.pushState({ tab }, "", window.location.pathname);
    }
    setActiveTab(tab);
  };

  // Back button support
  useEffect(() => {
    const onPopState = () => {
      if (tabHistory.current.length > 0) {
        isPopState.current = true;
        const prev = tabHistory.current.pop()!;
        localStorage.setItem("lastTab", prev);
        setActiveTab(prev);
        isPopState.current = false;
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const handleOcrSend = (text: string) => {
    setSolverQuestion(text);
    handleSetActiveTab("solver");
  };

  const handleSolutionGenerated = (solution: string) => {
    setLatestSolution(solution);
  };

  return (
    <>
      <Layout activeTab={activeTab} setActiveTab={handleSetActiveTab}>
        {activeTab === "resources" ? (
          <div className="flex-1 flex flex-col min-h-0">
            <ResourcesTab />
          </div>
        ) : (
          <div className="py-2">
            {activeTab === "solver" && (
              <SolverTab
                initialQuestion={solverQuestion}
                onSolutionGenerated={handleSolutionGenerated}
              />
            )}
            {activeTab === "external" && <ExternalSolverTab />}
            {activeTab === "ocr" && <OcrTab onSendToSolver={handleOcrSend} />}
            {activeTab === "graph" && <GraphTab />}
            {activeTab === "calculator" && <CalculatorTab />}
            {activeTab === "chat" && <ChatTab previousSolution={latestSolution} />}
            {activeTab === "quiz" && <QuizTab />}
            {activeTab === "homework" && <HomeworkTab />}
            {activeTab === "novels" && <NovelsTab />}
            {activeTab === "notes" && <NotesTab />}
            {activeTab === "syllabus" && <SyllabusTab />}
            {activeTab === "guide" && <GuideTab />}
            {activeTab === "progress" && <ProgressTab setActiveTab={handleSetActiveTab} />}
            {activeTab === "admin" && <AdminTab />}
            {activeTab === "puzzles" && <PuzzlesTab />}
            {activeTab === "sagemath" && <SageMathTab />}
            {activeTab === "moodle" && <MoodleTab />}
            {activeTab === "openedx" && <StudyHallTab />}
            {activeTab === "community" && <CommunityTab />}
            {activeTab === "settings" && <SettingsTab />}
          </div>
        )}
      </Layout>

      {adminSetupToken && (
        <AdminSetupModal
          setupToken={adminSetupToken}
          onClose={() => setAdminSetupToken(null)}
          onSuccess={() => { setAdminSetupToken(null); handleSetActiveTab("admin"); }}
        />
      )}
    </>
  );
}
