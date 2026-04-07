import React, { useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, Search, Github,
  Loader2, Sparkles, X, ChevronDown,
  ArrowLeft, ExternalLink, Download, Bot,
} from "lucide-react";
import { cn } from "@/lib/utils";
import PdfReader from "@/components/pdf-reader";
import { useAuth } from "@/hooks/use-auth";

const BASE_URL = import.meta.env.BASE_URL ?? "/";
function apiUrl(p: string) { return `${BASE_URL}api${p}`; }

// ── Types ────────────────────────────────────────────────────────────────────

type ReaderType = "pdf" | "archive" | "html" | "ai";

interface MathBook {
  id: string;
  title: string;
  author: string;
  category: string;
  topics: string[];
  level: string;
  description: string;
  icon: string;
  color: string;
  border: string;
  textColor: string;
  free: boolean;
  readerType: ReaderType;
  readerUrl: string;    // URL to load inside the in-app reader
  repoUrl?: string;     // GitHub repo for "Browse" link
}

// ── Book catalog ─────────────────────────────────────────────────────────────

const GH = "https://raw.githubusercontent.com/manjunath5496/Math-Lectures/master";

const BOOK_CATALOG: MathBook[] = [
  // ── O-Level / IGCSE ────────────────────────────────────────────────────────
  { id:"oz1", category:"O-Level / IGCSE", icon:"📗", level:"O-Level", free:true,
    color:"rgba(52,211,153,0.08)", border:"rgba(52,211,153,0.25)", textColor:"#6ee7b7",
    title:"Pre-Calculus", author:"Stitz & Zeager",
    description:"Covers functions, polynomial equations, exponentials, logarithms, and conic sections — perfect O-Level bridge to A-Level.",
    topics:["Functions","Polynomials","Exponentials","Logarithms","Conic Sections","Trigonometry"],
    readerType:"pdf", readerUrl:`${GH}/math(2).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"oz2", category:"O-Level / IGCSE", icon:"📘", level:"O-Level", free:true,
    color:"rgba(96,165,250,0.08)", border:"rgba(96,165,250,0.25)", textColor:"#93c5fd",
    title:"College Algebra and Trigonometry", author:"Stitz & Zeager",
    description:"Comprehensive algebra and trig textbook. Ideal for O-Level students progressing to A-Level mathematics.",
    topics:["Algebra","Trigonometry","Functions","Equations","Inequalities","Matrices"],
    readerType:"pdf", readerUrl:`${GH}/math(3).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"oz3", category:"O-Level / IGCSE", icon:"📙", level:"O-Level", free:true,
    color:"rgba(251,146,60,0.08)", border:"rgba(251,146,60,0.25)", textColor:"#fdba74",
    title:"Business Math: A Step-by-Step Handbook", author:"Jean-Paul Olivier",
    description:"Practical math for business: percentages, interest, annuities, budgeting — highly relevant to ZIMSEC Commerce.",
    topics:["Percentages","Interest","Annuities","Break-even","Financial Math","Budgets"],
    readerType:"pdf", readerUrl:`${GH}/math(16).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  // ── Algebra ───────────────────────────────────────────────────────────────
  { id:"al1", category:"Algebra", icon:"🔢", level:"O-Level to University", free:true,
    color:"rgba(99,102,241,0.08)", border:"rgba(99,102,241,0.25)", textColor:"#a5b4fc",
    title:"Abstract Algebra: Examples and Applications", author:"Justin Hill & Chris Thron",
    description:"Introduces abstract algebra through real-world examples. Groups, rings, fields, and homomorphisms with worked problems.",
    topics:["Groups","Rings","Fields","Homomorphisms","Cosets","Permutations"],
    readerType:"pdf", readerUrl:`${GH}/math(1).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"al2", category:"Algebra", icon:"📐", level:"University", free:true,
    color:"rgba(139,92,246,0.08)", border:"rgba(139,92,246,0.25)", textColor:"#c4b5fd",
    title:"Abstract Algebra: Theory and Applications", author:"Thomas Judson",
    description:"Complete abstract algebra textbook used in university courses worldwide. Groups, rings, fields, and Galois theory.",
    topics:["Groups","Rings","Fields","Galois Theory","Polynomial Rings","Sylow Theorems"],
    readerType:"pdf", readerUrl:`${GH}/math(26).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"al3", category:"Algebra", icon:"⚡", level:"A-Level / University", free:true,
    color:"rgba(168,85,247,0.08)", border:"rgba(168,85,247,0.25)", textColor:"#d8b4fe",
    title:"A First Course in Linear Algebra", author:"Robert Beezer",
    description:"Free, open-source linear algebra text. Vectors, matrices, determinants, eigenvalues, and vector spaces with full solutions.",
    topics:["Vectors","Matrices","Determinants","Eigenvalues","Vector Spaces","Linear Maps"],
    readerType:"pdf", readerUrl:`${GH}/math(34).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"al4", category:"Algebra", icon:"🔣", level:"O-Level", free:true,
    color:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.25)", textColor:"#fde68a",
    title:"Fundamentals of Matrix Algebra", author:"Gregory Hartman",
    description:"Focused matrix algebra textbook: operations, inverses, determinants, eigenvalues, and applications. Great for O-Level and A-Level.",
    topics:["Matrix Operations","Inverses","Determinants","Eigenvalues","Systems of Equations"],
    readerType:"pdf", readerUrl:`${GH}/math(6).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"al5", category:"Algebra", icon:"🧮", level:"O-Level", free:true,
    color:"rgba(251,146,60,0.08)", border:"rgba(251,146,60,0.25)", textColor:"#fdba74",
    title:"Open Resources for Community College Algebra", author:"Various",
    description:"Community college algebra from the ground up: equations, inequalities, functions, polynomials, and factoring.",
    topics:["Equations","Inequalities","Factoring","Functions","Polynomials","Rational Expressions"],
    readerType:"pdf", readerUrl:`${GH}/math(45).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  // ── Calculus ──────────────────────────────────────────────────────────────
  { id:"ca1", category:"Calculus", icon:"∫", level:"A-Level", free:true,
    color:"rgba(239,68,68,0.08)", border:"rgba(239,68,68,0.25)", textColor:"#fca5a5",
    title:"Single Variable Calculus: Early Transcendentals", author:"David Guichard",
    description:"Complete single-variable calculus with limits, derivatives, integrals, and applications. Free Whitman edition.",
    topics:["Limits","Derivatives","Integration","Applications","Series","Sequences"],
    readerType:"pdf", readerUrl:`${GH}/math(29).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ca2", category:"Calculus", icon:"📈", level:"A-Level", free:true,
    color:"rgba(251,146,60,0.08)", border:"rgba(251,146,60,0.25)", textColor:"#fdba74",
    title:"Calculus (Print Version)", author:"David Guichard",
    description:"Print-ready edition of the full Guichard calculus text — limits, derivatives, integrals, polar, and series.",
    topics:["Limits","Derivatives","Integrals","Polar Coordinates","Series","Vectors"],
    readerType:"pdf", readerUrl:`${GH}/math(30).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ca3", category:"Calculus", icon:"🔬", level:"A-Level", free:true,
    color:"rgba(16,185,129,0.08)", border:"rgba(16,185,129,0.25)", textColor:"#6ee7b7",
    title:"Multivariable Calculus", author:"Jim Fowler",
    description:"Extends single-variable calculus to functions of several variables: partial derivatives, multiple integrals, and vector calculus.",
    topics:["Partial Derivatives","Multiple Integrals","Vector Fields","Stokes Theorem","Gradient","Divergence"],
    readerType:"pdf", readerUrl:`${GH}/math(14).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ca4", category:"Calculus", icon:"🌊", level:"A-Level", free:true,
    color:"rgba(59,130,246,0.08)", border:"rgba(59,130,246,0.25)", textColor:"#93c5fd",
    title:"Differential Calculus and Sage", author:"David Joyner & William Granville",
    description:"Differential calculus with the Sage computer algebra system. Great for computational exploration.",
    topics:["Differentiation","Sage CAS","Limits","Optimization","Chain Rule","Implicit Differentiation"],
    readerType:"pdf", readerUrl:`${GH}/math(37).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ca5", category:"Calculus", icon:"📉", level:"A-Level", free:true,
    color:"rgba(244,63,94,0.08)", border:"rgba(244,63,94,0.25)", textColor:"#fda4af",
    title:"Contemporary Calculus", author:"Dale Hoffman",
    description:"A modern, accessible calculus textbook with practical applications and clear explanations for A-Level students.",
    topics:["Functions","Derivatives","Integrals","Applications","Sequences","Series"],
    readerType:"pdf", readerUrl:`${GH}/math(38).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ca6", category:"Calculus", icon:"♾️", level:"A-Level / University", free:true,
    color:"rgba(99,102,241,0.08)", border:"rgba(99,102,241,0.25)", textColor:"#a5b4fc",
    title:"Calculus Refresher", author:"A. Klaf",
    description:"Concise calculus review covering differentiation and integration techniques. Ideal as a quick-reference or revision guide.",
    topics:["Differentiation Rules","Integration Techniques","Series","Partial Fractions","Substitution"],
    readerType:"pdf", readerUrl:`${GH}/math(40).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ca7", category:"Calculus", icon:"🧩", level:"University", free:true,
    color:"rgba(168,85,247,0.08)", border:"rgba(168,85,247,0.25)", textColor:"#d8b4fe",
    title:"The Calculus Integral", author:"Brian S. Thomson",
    description:"A rigorous treatment of the integral — Riemann, improper integrals, and the fundamental theorem.",
    topics:["Riemann Integral","Improper Integrals","Fundamental Theorem","Sequences of Functions"],
    readerType:"pdf", readerUrl:`${GH}/math(42).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ca8", category:"Calculus", icon:"🌀", level:"A-Level / University", free:true,
    color:"rgba(20,184,166,0.08)", border:"rgba(20,184,166,0.25)", textColor:"#5eead4",
    title:"Differential Equations", author:"Paul Dawkins",
    description:"Comprehensive differential equations text covering first and second order ODEs, systems, and Laplace transforms.",
    topics:["First Order ODEs","Second Order ODEs","Systems","Laplace Transforms","Series Solutions"],
    readerType:"pdf", readerUrl:`${GH}/math(32).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ca9", category:"Calculus", icon:"🔭", level:"A-Level", free:true,
    color:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.25)", textColor:"#fde68a",
    title:"Elementary Differential Equations", author:"Trench",
    description:"Clear introduction to ordinary differential equations with applications. Widely used in A-Level and first-year university.",
    topics:["ODEs","Separable Equations","Linear Equations","Laplace Transforms","Series"],
    readerType:"pdf", readerUrl:`${GH}/math(33).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ca10", category:"Calculus", icon:"🐍", level:"University", free:true,
    color:"rgba(52,211,153,0.08)", border:"rgba(52,211,153,0.25)", textColor:"#6ee7b7",
    title:"Introductory Differential Equations using SAGE", author:"David Joyner",
    description:"Ordinary differential equations with hands-on computation using the Sage algebra system.",
    topics:["ODEs","Phase Plane","Sage CAS","Systems of ODEs","Numerical Methods"],
    readerType:"pdf", readerUrl:`${GH}/math(44).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  // ── Geometry & Trigonometry ───────────────────────────────────────────────
  { id:"gt1", category:"Geometry & Trigonometry", icon:"📐", level:"A-Level / University", free:true,
    color:"rgba(20,184,166,0.08)", border:"rgba(20,184,166,0.25)", textColor:"#5eead4",
    title:"Geometry with an Introduction to Cosmic Topology", author:"Michael Hitchman",
    description:"Connects classical Euclidean geometry to spherical and hyperbolic geometry. Excellent for deeper geometric insight.",
    topics:["Euclidean Geometry","Spherical Geometry","Hyperbolic Geometry","Transformations","Topology"],
    readerType:"pdf", readerUrl:`${GH}/math(7).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"gt2", category:"Geometry & Trigonometry", icon:"⭕", level:"O-Level", free:true,
    color:"rgba(6,182,212,0.08)", border:"rgba(6,182,212,0.25)", textColor:"#67e8f9",
    title:"Calculus Made Easy", author:"Silvanus P. Thompson",
    description:"Classic 1910 public domain calculus with strong geometric intuition. Famous for making derivatives and integrals accessible.",
    topics:["Differentiation","Integration","Rates of Change","Maxima & Minima","Geometric Interpretation"],
    readerType:"archive", readerUrl:"https://archive.org/embed/calculusmadeeasy00thomrich",
    repoUrl:"https://archive.org/details/calculusmadeeasy00thomrich" },

  { id:"gt3", category:"Geometry & Trigonometry", icon:"📊", level:"A-Level / University", free:true,
    color:"rgba(59,130,246,0.08)", border:"rgba(59,130,246,0.25)", textColor:"#93c5fd",
    title:"Analytical Geometry", author:"Henry Sinclair Hall",
    description:"Coordinate geometry, conic sections, and curves. Public domain classic bridging O-Level to further mathematics.",
    topics:["Coordinate Geometry","Conic Sections","Curves","Circle Equations","Parabola","Ellipse"],
    readerType:"archive", readerUrl:"https://archive.org/embed/analyticalgeome01hallgoog",
    repoUrl:"https://archive.org/details/analyticalgeome01hallgoog" },

  // ── Statistics & Probability ──────────────────────────────────────────────
  { id:"sp1", category:"Statistics & Probability", icon:"📊", level:"O-Level to University", free:true,
    color:"rgba(96,165,250,0.08)", border:"rgba(96,165,250,0.25)", textColor:"#93c5fd",
    title:"Introductory Statistics with Randomization and Simulation", author:"Diez, Barr & Çetinkaya-Rundel",
    description:"OpenIntro statistics with simulation methods. Data analysis, probability, inference, and regression.",
    topics:["Data","Probability","Sampling","Confidence Intervals","Hypothesis Tests","Regression"],
    readerType:"pdf", readerUrl:`${GH}/math(10).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"sp2", category:"Statistics & Probability", icon:"🎲", level:"A-Level", free:true,
    color:"rgba(251,191,36,0.08)", border:"rgba(251,191,36,0.25)", textColor:"#fde68a",
    title:"Lies, Damned Lies, or Statistics", author:"Jonathan Poritz",
    description:"Critical thinking about statistics — how to interpret data, avoid misleading graphs, and understand real-world data.",
    topics:["Data Literacy","Misleading Statistics","Probability","Distributions","Critical Thinking"],
    readerType:"pdf", readerUrl:`${GH}/math(11).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"sp3", category:"Statistics & Probability", icon:"📉", level:"University", free:true,
    color:"rgba(52,211,153,0.08)", border:"rgba(52,211,153,0.25)", textColor:"#6ee7b7",
    title:"Learning Statistics with R", author:"Daniel Navarro",
    description:"Statistics theory combined with R programming. Covers distributions, t-tests, ANOVA, regression, and Bayesian methods.",
    topics:["R Programming","Distributions","Hypothesis Testing","ANOVA","Regression","Bayesian"],
    readerType:"pdf", readerUrl:`${GH}/math(12).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  // ── Number Theory ─────────────────────────────────────────────────────────
  { id:"nt1", category:"Number Theory", icon:"🔑", level:"University", free:true,
    color:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.25)", textColor:"#fde68a",
    title:"The Joy of Cryptography", author:"Mike Rosulek",
    description:"Cryptography from the mathematical foundations: modular arithmetic, primes, RSA, and modern cryptographic protocols.",
    topics:["Modular Arithmetic","Primes","RSA","Public-Key","Block Ciphers","Hash Functions"],
    readerType:"pdf", readerUrl:`${GH}/math(5).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"nt2", category:"Number Theory", icon:"🔢", level:"University", free:true,
    color:"rgba(239,68,68,0.08)", border:"rgba(239,68,68,0.25)", textColor:"#fca5a5",
    title:"An Introduction to the Theory of Numbers", author:"Moser",
    description:"Classical number theory: divisibility, congruences, quadratic reciprocity, Diophantine equations, and prime distributions.",
    topics:["Divisibility","Primes","Congruences","Diophantine Equations","Quadratic Reciprocity","Fermat"],
    readerType:"pdf", readerUrl:`${GH}/math(13).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  // ── Discrete Mathematics ──────────────────────────────────────────────────
  { id:"dm1", category:"Discrete Mathematics", icon:"🔗", level:"University", free:true,
    color:"rgba(99,102,241,0.08)", border:"rgba(99,102,241,0.25)", textColor:"#a5b4fc",
    title:"A Cool Brisk Walk Through Discrete Mathematics", author:"Stephen Davies",
    description:"Fast-paced discrete math covering logic, sets, graph theory, combinatorics, and algorithms.",
    topics:["Logic","Sets","Relations","Graph Theory","Combinatorics","Proof"],
    readerType:"pdf", readerUrl:`${GH}/math(4).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"dm2", category:"Discrete Mathematics", icon:"🧮", level:"University", free:true,
    color:"rgba(139,92,246,0.08)", border:"rgba(139,92,246,0.25)", textColor:"#c4b5fd",
    title:"Discrete Mathematics: An Open Introduction", author:"Oscar Levin",
    description:"Accessible discrete mathematics textbook: logic, proofs, sets, functions, graph theory, and counting.",
    topics:["Logic","Proofs","Sets","Functions","Graph Theory","Counting","Relations"],
    readerType:"pdf", readerUrl:`${GH}/math(25).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"dm3", category:"Discrete Mathematics", icon:"🎯", level:"University", free:true,
    color:"rgba(168,85,247,0.08)", border:"rgba(168,85,247,0.25)", textColor:"#d8b4fe",
    title:"Combinatorics Through Guided Discovery", author:"Kenneth Bogart",
    description:"Learn combinatorics through guided problems: permutations, combinations, generating functions, and Polya theory.",
    topics:["Permutations","Combinations","Generating Functions","Polya Theory","Graph Coloring","Partitions"],
    readerType:"pdf", readerUrl:`${GH}/math(31).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  // ── Applied Mathematics ───────────────────────────────────────────────────
  { id:"am1", category:"Applied Mathematics", icon:"🐍", level:"University", free:true,
    color:"rgba(16,185,129,0.08)", border:"rgba(16,185,129,0.25)", textColor:"#6ee7b7",
    title:"First Semester in Numerical Analysis with Python", author:"Yaning Liu",
    description:"Numerical methods implemented in Python: root finding, interpolation, integration, ODEs, and linear systems.",
    topics:["Root Finding","Interpolation","Numerical Integration","ODEs","Python","Error Analysis"],
    readerType:"pdf", readerUrl:`${GH}/math(15).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"am2", category:"Applied Mathematics", icon:"🔮", level:"University", free:true,
    color:"rgba(6,182,212,0.08)", border:"rgba(6,182,212,0.25)", textColor:"#67e8f9",
    title:"First Semester in Numerical Analysis with Julia", author:"Yaning Liu",
    description:"Numerical analysis using Julia — same methods as Python edition with Julia's high-performance computing focus.",
    topics:["Root Finding","Interpolation","Numerical Integration","Julia","Linear Systems","ODEs"],
    readerType:"pdf", readerUrl:`${GH}/math(17).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"am3", category:"Applied Mathematics", icon:"🌿", level:"University", free:true,
    color:"rgba(52,211,153,0.08)", border:"rgba(52,211,153,0.25)", textColor:"#6ee7b7",
    title:"Tea Time Numerical Analysis", author:"Leon Q. Brin",
    description:"A friendly, informal introduction to numerical analysis: bisection, Newton's method, interpolation, and quadrature.",
    topics:["Bisection Method","Newton's Method","Interpolation","Numerical Quadrature","Floating Point"],
    readerType:"pdf", readerUrl:`${GH}/math(19).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"am4", category:"Applied Mathematics", icon:"🎮", level:"University", free:true,
    color:"rgba(244,63,94,0.08)", border:"rgba(244,63,94,0.25)", textColor:"#fda4af",
    title:"Introduction to Game Theory: a Discovery Approach", author:"Jennifer Firkins Nordstrom",
    description:"Learn game theory through discovery: zero-sum games, mixed strategies, Nash equilibria, and social dilemmas.",
    topics:["Zero-Sum Games","Nash Equilibria","Mixed Strategies","Payoff Matrices","Prisoner's Dilemma"],
    readerType:"pdf", readerUrl:`${GH}/math(9).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"am5", category:"Applied Mathematics", icon:"🖥️", level:"University", free:true,
    color:"rgba(99,102,241,0.08)", border:"rgba(99,102,241,0.25)", textColor:"#a5b4fc",
    title:"Introduction to GNU Octave", author:"Jason Lachniet",
    description:"Brief tutorial covering GNU Octave for linear algebra and calculus students — matrices, plotting, and scripting.",
    topics:["Octave/MATLAB","Matrix Operations","Plotting","Scripts","Linear Algebra","Calculus"],
    readerType:"pdf", readerUrl:`${GH}/math(8).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"am6", category:"Applied Mathematics", icon:"🌱", level:"University", free:true,
    color:"rgba(245,158,11,0.08)", border:"rgba(245,158,11,0.25)", textColor:"#fde68a",
    title:"Quantitative Problem Solving in Natural Resources", author:"William Nelson",
    description:"Applied quantitative methods for natural resources: statistics, modeling, optimization, and data analysis.",
    topics:["Statistical Modeling","Optimization","Data Analysis","Environmental Math","Regression"],
    readerType:"pdf", readerUrl:`${GH}/math(18).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  // ── Lecture Notes / Analysis ──────────────────────────────────────────────
  { id:"ln1", category:"Lecture Notes", icon:"📝", level:"University", free:true,
    color:"rgba(168,85,247,0.08)", border:"rgba(168,85,247,0.25)", textColor:"#d8b4fe",
    title:"Transition to Higher Mathematics: Structure and Proof", author:"Smith, Eggen & St. Andre",
    description:"Bridge course from computational to proof-based mathematics: logic, sets, functions, and mathematical induction.",
    topics:["Mathematical Proof","Logic","Sets","Functions","Induction","Relations"],
    readerType:"pdf", readerUrl:`${GH}/math(20).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ln2", category:"Lecture Notes", icon:"📓", level:"University", free:true,
    color:"rgba(52,211,153,0.08)", border:"rgba(52,211,153,0.25)", textColor:"#6ee7b7",
    title:"Real Analysis", author:"Brian S. Thomson, Judith B. Bruckner",
    description:"Complete real analysis from the basics: limits, continuity, differentiation, integration, and metric spaces.",
    topics:["Limits","Continuity","Differentiation","Integration","Metric Spaces","Sequences"],
    readerType:"pdf", readerUrl:`${GH}/math(27).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ln3", category:"Lecture Notes", icon:"📒", level:"University", free:true,
    color:"rgba(6,182,212,0.08)", border:"rgba(6,182,212,0.25)", textColor:"#67e8f9",
    title:"Measure, Integration and Real Analysis", author:"Sheldon Axler",
    description:"Graduate-level real analysis covering measure theory, Lebesgue integration, and Hilbert spaces.",
    topics:["Measure Theory","Lebesgue Integral","Hilbert Spaces","Banach Spaces","Fourier Analysis"],
    readerType:"pdf", readerUrl:`${GH}/math(39).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ln4", category:"Lecture Notes", icon:"📔", level:"University", free:true,
    color:"rgba(239,68,68,0.08)", border:"rgba(239,68,68,0.25)", textColor:"#fca5a5",
    title:"Elementary Real Analysis", author:"Thomson, Bruckner & Bruckner",
    description:"Classic real analysis textbook for undergraduates: sequences, series, continuity, and the Riemann integral.",
    topics:["Sequences","Series","Continuity","Riemann Integral","Metric Spaces","Uniform Convergence"],
    readerType:"pdf", readerUrl:`${GH}/math(41).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  { id:"ln5", category:"Lecture Notes", icon:"🗒️", level:"University", free:true,
    color:"rgba(251,146,60,0.08)", border:"rgba(251,146,60,0.25)", textColor:"#fdba74",
    title:"Theory of the Integral", author:"Brian S. Thomson",
    description:"Advanced treatment of integration theory from Riemann to Lebesgue and beyond.",
    topics:["Riemann Integral","Lebesgue Integral","Gauge Integral","Integration Theory","Measure"],
    readerType:"pdf", readerUrl:`${GH}/math(43).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },

  // ── Problem Solving ───────────────────────────────────────────────────────
  { id:"ps1", category:"Problem Solving", icon:"🏆", level:"O-Level / University", free:true,
    color:"rgba(239,68,68,0.08)", border:"rgba(239,68,68,0.25)", textColor:"#fca5a5",
    title:"Mathematical Discovery: Volume 1", author:"A.M. Bruckheimer & R. Borasi",
    description:"A guided discovery approach to mathematics. Encourages problem-solving intuition, exploration, and proof construction.",
    topics:["Problem Solving","Mathematical Induction","Number Patterns","Proof","Exploration"],
    readerType:"pdf", readerUrl:`${GH}/math(28).pdf`,
    repoUrl:"https://github.com/manjunath5496/Math-Lectures" },
];

const CATEGORY_ORDER = ["O-Level / IGCSE", "Algebra", "Calculus", "Geometry & Trigonometry", "Statistics & Probability", "Number Theory", "Discrete Mathematics", "Applied Mathematics", "Lecture Notes", "Problem Solving"];
const CATEGORIES = ["All", ...CATEGORY_ORDER.filter(c => BOOK_CATALOG.some(b => b.category === c)),
  ...Array.from(new Set(BOOK_CATALOG.map(b => b.category).filter(c => !CATEGORY_ORDER.includes(c))))];

const PAGE_SIZE = 8;

// ── AI streaming ──────────────────────────────────────────────────────────────

function useAiStream() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (system: string, message: string) => {
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setText(""); setLoading(true);
    try {
      const res = await fetch(apiUrl("/open-assist"), {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ system, message, model: "qwen/qwen3.5-122b-a10b" }),
        signal: ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error("AI unavailable");
      const reader = res.body.getReader();
      const dec = new TextDecoder(); let buf = "";
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try { const d = JSON.parse(line.slice(6)) as { delta?: string }; if (d.delta) setText(p => p + d.delta); } catch {}
        }
      }
    } catch (e) { if ((e as Error).name !== "AbortError") {} }
    setLoading(false);
  }, []);

  return { text, loading, run, cancel: () => { abortRef.current?.abort(); setLoading(false); }, reset: () => setText("") };
}

// ── In-app Book Reader ───────────────────────────────────────────────────────

function MarkdownText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5">
      {text.split("\n").map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        if (line.startsWith("### ")) return <p key={i} className="font-bold text-white mt-3 mb-1">{line.slice(4)}</p>;
        if (line.startsWith("## ")) return <p key={i} className="text-base font-bold text-white mt-4 mb-1.5">{line.slice(3)}</p>;
        if (line.startsWith("# ")) return <p key={i} className="text-lg font-black text-white mt-5 mb-2">{line.slice(2)}</p>;
        if (line.startsWith("- ") || line.startsWith("* ")) return (
          <p key={i} className="text-sm text-slate-300 flex gap-1.5 pl-2">
            <span className="text-indigo-400 shrink-0 mt-0.5">▸</span>{line.slice(2)}
          </p>
        );
        const parts = line.split(/\*\*([^*]+)\*\*/g);
        return <p key={i} className="text-sm text-slate-300 leading-relaxed">{parts.map((p, k) => k % 2 === 1 ? <strong key={k} className="text-white">{p}</strong> : p)}</p>;
      })}
    </div>
  );
}

const STUDY_GUIDE_SYSTEM = `You are a mathematics tutor for ZIMSEC and Cambridge O-Level students in Zimbabwe. 
Generate a comprehensive, structured study guide for the given textbook.
Format the guide with:
- A brief overview of the book
- Chapter-by-chapter breakdown with key topics and learning objectives
- Key formulas and theorems to memorize
- Practice problem suggestions for each chapter
- Exam tips relevant to ZIMSEC/Cambridge O-Level
Make it detailed, practical, and student-friendly.`;

function BookReader({ book, onClose }: { book: MathBook; onClose: () => void }) {
  const ai = useAiStream();
  const [aiStarted, setAiStarted] = useState(false);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [frameError, setFrameError] = useState(false);

  const startAiGuide = useCallback(() => {
    setAiStarted(true);
    ai.run(STUDY_GUIDE_SYSTEM, `Generate a comprehensive study guide for "${book.title}" by ${book.author}. Topics covered: ${book.topics.join(", ")}.`);
  }, [book, ai]);

  const isEmbedded = book.readerType !== "ai";
  const proxyPdfUrl = book.readerType === "pdf"
    ? `/api/external-pdf?url=${encodeURIComponent(book.readerUrl)}`
    : "";

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "#07090f" }}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-3 border-b border-white/10"
        style={{ background: "rgba(255,255,255,0.03)" }}>
        <button onClick={onClose}
          className="p-2 rounded-xl text-muted-foreground hover:text-white hover:bg-white/10 transition-all shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <span className="text-xl shrink-0">{book.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{book.title}</p>
          <p className="text-[11px] text-muted-foreground truncate">by {book.author}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {book.repoUrl && (
            <a href={book.repoUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs border border-white/15 text-muted-foreground hover:text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <ExternalLink className="w-3 h-3" /> Source
            </a>
          )}
          {isEmbedded && book.readerUrl && (
            <a href={book.readerUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs border border-white/15 text-muted-foreground hover:text-white transition-colors"
              style={{ background: "rgba(255,255,255,0.04)" }}>
              <Download className="w-3 h-3" /> Open tab
            </a>
          )}
          <button onClick={onClose}
            className="p-2 rounded-xl text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden relative">
        {/* react-pdf reader for real PDF files */}
        {book.readerType === "pdf" && proxyPdfUrl && (
          <PdfReader url={proxyPdfUrl} title={book.title} />
        )}

        {/* iframe reader for archive.org and html */}
        {(book.readerType === "archive" || book.readerType === "html") && !frameError && (
          <>
            {!frameLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-400" />
                <p className="text-sm">Loading content…</p>
              </div>
            )}
            <iframe
              src={book.readerUrl}
              className="w-full h-full border-0"
              onLoad={() => setFrameLoaded(true)}
              onError={() => setFrameError(true)}
              title={book.title}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              style={{ display: frameLoaded ? "block" : "none" }}
            />
          </>
        )}

        {/* Fallback if iframe failed to load */}
        {(book.readerType === "archive" || book.readerType === "html") && frameError && (
          <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
            <p className="text-white font-semibold">Couldn't embed this content</p>
            <p className="text-sm text-muted-foreground max-w-sm">The publisher has blocked embedded viewing. Open in a new tab instead.</p>
            <a href={book.readerUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
              style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)" }}>
              <ExternalLink className="w-4 h-4" /> Open in New Tab
            </a>
            <button onClick={() => { setFrameError(false); startAiGuide(); }}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-indigo-300 border border-indigo-500/30"
              style={{ background: "rgba(99,102,241,0.1)" }}>
              <Bot className="w-4 h-4" /> Get AI Study Guide instead
            </button>
          </div>
        )}

        {/* AI Study Guide mode */}
        {(book.readerType === "ai" || (frameError && aiStarted)) && (
          <div className="h-full overflow-y-auto p-5 space-y-4 max-w-3xl mx-auto">
            {!aiStarted ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center">
                <div className="text-5xl">{book.icon}</div>
                <div className="space-y-2">
                  <p className="text-xl font-display font-bold text-white">{book.title}</p>
                  <p className="text-sm text-muted-foreground max-w-md leading-relaxed">{book.description}</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {book.topics.map(t => (
                    <span key={t} className="px-2.5 py-1 rounded-lg text-xs text-white/60 bg-white/8 border border-white/10">{t}</span>
                  ))}
                </div>
                <button onClick={startAiGuide}
                  className="flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white transition-all hover:scale-[1.02]"
                  style={{ background: "rgba(99,102,241,0.25)", border: "1px solid rgba(99,102,241,0.5)" }}>
                  <Sparkles className="w-5 h-5" /> Generate AI Study Guide
                </button>
                {book.repoUrl && (
                  <a href={book.repoUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs text-muted-foreground border border-white/10 hover:border-white/20 hover:text-white transition-colors"
                    style={{ background: "rgba(255,255,255,0.04)" }}>
                    <Github className="w-4 h-4" /> Browse Source Repository
                  </a>
                )}
              </div>
            ) : (
              <div className="space-y-4 pb-8">
                <div className="flex items-center gap-3 pb-3 border-b border-white/10">
                  <div className="p-2 rounded-xl shrink-0" style={{ background: "rgba(99,102,241,0.2)", border: "1px solid rgba(99,102,241,0.35)" }}>
                    <Bot className="w-5 h-5 text-indigo-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">AI Study Guide</p>
                    <p className="text-xs text-muted-foreground">{book.title}</p>
                  </div>
                  {ai.loading && (
                    <div className="ml-auto flex items-center gap-1.5 text-xs text-indigo-400">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…
                    </div>
                  )}
                  {!ai.loading && ai.text && (
                    <button onClick={startAiGuide} className="ml-auto text-xs text-muted-foreground hover:text-white flex items-center gap-1 transition-colors">
                      <Sparkles className="w-3 h-3" /> Regenerate
                    </button>
                  )}
                </div>
                {ai.text ? <MarkdownText text={ai.text} /> : (
                  <div className="flex items-center gap-2 text-indigo-400 py-4">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Generating your personalised study guide…</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ── AI Book Finder ────────────────────────────────────────────────────────────

const AI_BOOK_SYSTEM = `You are a mathematics librarian for ZIMSEC and Cambridge O-Level students in Zimbabwe. 
Available books:
${BOOK_CATALOG.map(b => `- "${b.title}" by ${b.author} [${b.category}] Topics: ${b.topics.join(", ")}`).join("\n")}

Also available in these repositories:
- https://github.com/nablamath/notes — Math notes
- https://github.com/manjunath5496/Math-Lectures — Math lecture notes 
- https://github.com/manjunath5496/Mathematics-Books — Mathematics books

Recommend specific books for the user's request. Quote book titles exactly. Be concise and helpful.`;

// ── Book Card ─────────────────────────────────────────────────────────────────

function BookCard({ book, onOpen }: { book: MathBook; onOpen: () => void }) {
  const readerLabel = book.readerType === "pdf" ? "Read PDF" : book.readerType === "archive" ? "Read Book" : book.readerType === "html" ? "Open Reader" : "Study Guide";

  return (
    <div className="rounded-2xl p-5 space-y-3 flex flex-col" style={{ background: book.color, border: `1px solid ${book.border}` }}>
      <div className="flex items-start gap-3">
        <span className="text-3xl shrink-0">{book.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-wide mb-0.5" style={{ color: book.textColor }}>{book.category}</p>
          <p className="text-sm font-bold text-white line-clamp-2">{book.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">by {book.author}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{book.description}</p>
      <div className="flex flex-wrap gap-1">
        {book.topics.slice(0, 4).map(t => (
          <span key={t} className="px-1.5 py-0.5 rounded-md text-[10px] font-medium text-white/60 bg-white/8">{t}</span>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-auto pt-1">
        {book.free && <span className="text-[10px] font-bold text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-500/10">FREE</span>}
        <span className="text-[10px] text-muted-foreground/60">{book.level}</span>
        <div className="flex gap-1.5 ml-auto">
          {book.repoUrl && (
            <a href={book.repoUrl} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-muted-foreground hover:text-white transition-colors" style={{ background: "rgba(255,255,255,0.06)" }}>
              <Github className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={onOpen}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-white transition-all hover:opacity-90"
            style={{ background: `${book.border.replace("0.25", "0.3")}`, border: `1px solid ${book.border}` }}>
            <BookOpen className="w-3 h-3" /> {readerLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Category Section ──────────────────────────────────────────────────────────

function CategorySection({ name, books, defaultOpen = false, onOpen }: {
  name: string;
  books: MathBook[];
  defaultOpen?: boolean;
  onOpen: (b: MathBook) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const shown = books.slice(0, visibleCount);

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
      {/* Section header */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
        style={{ background: open ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.015)" }}
      >
        <div className="flex items-center gap-2.5">
          <span className="text-base">{CATEGORY_ICONS[name] ?? "📂"}</span>
          <span className="text-sm font-bold text-white">{name}</span>
          <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.07)" }}>
            {books.length} book{books.length !== 1 ? "s" : ""}
          </span>
        </div>
        <ChevronDown
          className={cn("w-4 h-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")}
        />
      </button>

      {/* Books grid */}
      {open && (
        <div className="p-3 space-y-3 border-t border-white/8" style={{ background: "rgba(0,0,0,0.15)" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {shown.map(book => (
              <BookCard key={book.id} book={book} onOpen={() => onOpen(book)} />
            ))}
          </div>
          {visibleCount < books.length && (
            <div className="flex justify-center pt-1">
              <button
                onClick={() => setVisibleCount(v => v + PAGE_SIZE)}
                className="flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-semibold text-white/70 hover:text-white transition-all"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
              >
                <ChevronDown className="w-3.5 h-3.5" />
                Show {Math.min(PAGE_SIZE, books.length - visibleCount)} more
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const CATEGORY_ICONS: Record<string, string> = {
  "O-Level / IGCSE": "📗",
  "Algebra": "🔢",
  "Calculus": "∫",
  "Geometry & Trigonometry": "📐",
  "Statistics & Probability": "📊",
  "Number Theory": "🔑",
  "Discrete Mathematics": "🔗",
  "Applied Mathematics": "🖥️",
  "Lecture Notes": "📝",
  "Problem Solving": "🏆",
};

// ── Main Component ────────────────────────────────────────────────────────────

export default function MoodleTab() {
  const { isAuthenticated } = useAuth();
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");
  const [aiSearch, setAiSearch] = useState("");
  const [showAi, setShowAi] = useState(false);
  const [openBook, setOpenBook] = useState<MathBook | null>(null);
  const ai = useAiStream();

  function handleOpenBook(book: MathBook) {
    if (!isAuthenticated) {
      window.dispatchEvent(new CustomEvent("open-auth-modal", { detail: { reason: "pdf" } }));
      return;
    }
    setOpenBook(book);
  }

  const filtered = BOOK_CATALOG.filter(b => {
    const catOk = category === "All" || b.category === category;
    const q = search.toLowerCase();
    return catOk && (!q || b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q) ||
      b.description.toLowerCase().includes(q) || b.topics.some(t => t.toLowerCase().includes(q)));
  });

  const groupedCategories = Array.from(new Set(filtered.map(b => b.category))).map(cat => ({
    name: cat,
    books: filtered.filter(b => b.category === cat),
  }));

  const handleAiSearch = () => {
    if (!aiSearch.trim()) return;
    ai.reset(); ai.run(AI_BOOK_SYSTEM, aiSearch); setShowAi(true);
  };

  return (
    <>
      {/* In-app reader overlay */}
      <AnimatePresence>
        {openBook && <BookReader book={openBook} onClose={() => setOpenBook(null)} />}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5 max-w-4xl mx-auto">

        {/* Header */}
        <div className="rounded-2xl p-5 flex items-start gap-4" style={{ background: "linear-gradient(135deg, rgba(251,113,133,0.1), rgba(99,102,241,0.06))", border: "1px solid rgba(251,113,133,0.2)" }}>
          <div className="p-3 rounded-2xl text-2xl shrink-0" style={{ background: "rgba(251,113,133,0.2)", border: "1px solid rgba(251,113,133,0.35)" }}>📚</div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-display font-black text-white">Moodle Math Library</h2>
            </div>
            <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
              {BOOK_CATALOG.length} curated mathematics textbooks and notes — read them right here without leaving the app.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                { label: "Math Books", url: "https://github.com/manjunath5496/Mathematics-Books" },
                { label: "Math Lectures", url: "https://github.com/manjunath5496/Math-Lectures" },
                { label: "nablamath Notes", url: "https://github.com/nablamath/notes" },
              ].map(r => (
                <a key={r.label} href={r.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] border border-white/15 text-rose-300 hover:text-white transition-colors"
                  style={{ background: "rgba(251,113,133,0.1)" }}>
                  <Github className="w-3 h-3" /> {r.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* AI Book Finder */}
        <div className="rounded-2xl p-4 space-y-3" style={{ background: "rgba(99,102,241,0.06)", border: "1px solid rgba(99,102,241,0.2)" }}>
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <p className="text-sm font-semibold text-white">AI Book Finder</p>
            <span className="text-xs text-muted-foreground">— find the right book for any topic</span>
          </div>
          <div className="flex gap-2">
            <input type="text" value={aiSearch} onChange={e => setAiSearch(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleAiSearch()}
              placeholder="e.g. 'find me a trigonometry book for O-Level' or 'books on probability'"
              className="flex-1 px-3 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-indigo-400/50 transition-colors placeholder:text-muted-foreground/60" />
            {ai.loading ? (
              <button onClick={ai.cancel} className="px-4 py-2.5 rounded-xl text-sm text-red-300 border border-red-500/30" style={{ background: "rgba(239,68,68,0.1)" }}>Stop</button>
            ) : (
              <button onClick={handleAiSearch} disabled={!aiSearch.trim()}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40 transition-all"
                style={{ background: "rgba(99,102,241,0.3)", border: "1px solid rgba(99,102,241,0.5)" }}>
                <Sparkles className="w-4 h-4" /> Find
              </button>
            )}
          </div>
          {showAi && (ai.text || ai.loading) && (
            <div className="rounded-xl p-3 max-h-64 overflow-y-auto space-y-1.5" style={{ background: "rgba(99,102,241,0.08)", border: "1px solid rgba(99,102,241,0.15)" }}>
              {ai.loading && !ai.text && <div className="flex items-center gap-2 text-indigo-400 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Searching…</div>}
              {ai.text.split("\n").map((line, i) => {
                if (!line.trim()) return <div key={i} className="h-1.5" />;
                if (line.startsWith("##")) return <p key={i} className="text-sm font-bold text-white">{line.replace(/^#+\s/, "")}</p>;
                if (line.startsWith("- ")) return <p key={i} className="pl-2 text-sm text-slate-300 flex gap-1.5"><span className="text-indigo-400 shrink-0">▸</span>{line.slice(2)}</p>;
                const bparts = line.split(/\*\*([^*]+)\*\*/g);
                return <p key={i} className="text-sm text-slate-300">{bparts.map((p, k) => k%2===1 ? <strong key={k} className="text-white">{p}</strong> : p)}</p>;
              })}
              {ai.loading && ai.text && <div className="flex items-center gap-1 text-xs text-indigo-400/60"><Loader2 className="w-3 h-3 animate-spin" /> Generating…</div>}
            </div>
          )}
          {showAi && !ai.loading && ai.text && (
            <button onClick={() => { setShowAi(false); ai.reset(); setAiSearch(""); }}
              className="text-xs text-muted-foreground hover:text-white flex items-center gap-1 transition-colors">
              <X className="w-3 h-3" /> Clear results
            </button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: "📚", value: BOOK_CATALOG.length, label: "Books Available", color: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.2)" },
            { icon: "📖", value: BOOK_CATALOG.filter(b => b.readerType !== "ai").length, label: "In-App Readable", color: "rgba(52,211,153,0.08)", border: "rgba(52,211,153,0.2)" },
            { icon: "📂", value: CATEGORIES.length - 1, label: "Categories", color: "rgba(251,191,36,0.08)", border: "rgba(251,191,36,0.2)" },
          ].map(s => (
            <div key={s.label} className="p-4 rounded-2xl flex items-center gap-3" style={{ background: s.color, border: `1px solid ${s.border}` }}>
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className="text-xl font-display font-bold text-white">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Search + Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" placeholder="Search books by title, author, or topic…" value={search}
              onChange={e => { setSearch(e.target.value); }}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-white/25 transition-colors placeholder:text-muted-foreground/60" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                className={cn("px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all", category === cat ? "text-white border-rose-500/50 bg-rose-500/15" : "text-muted-foreground border-white/10 hover:border-white/20 hover:text-white")}>
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Book grid — flat when filtering by category or searching, grouped sections when on All */}
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">{filtered.length} book{filtered.length !== 1 ? "s" : ""} found</p>

          {filtered.length === 0 && (
            <div className="text-center py-16 text-muted-foreground text-sm">
              No books match. Try a different search or browse the repositories above.
            </div>
          )}

          {filtered.length > 0 && (category !== "All" || search) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {filtered.map(book => (
                <BookCard key={book.id} book={book} onOpen={() => handleOpenBook(book)} />
              ))}
            </div>
          )}

          {filtered.length > 0 && category === "All" && !search && (
            <div className="space-y-2">
              {groupedCategories.map((group, i) => (
                <CategorySection
                  key={group.name}
                  name={group.name}
                  books={group.books}
                  defaultOpen={i === 0}
                  onOpen={handleOpenBook}
                />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </>
  );
}
