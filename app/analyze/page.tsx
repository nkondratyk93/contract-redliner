"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Upload, FileText, Loader2, AlertCircle } from "lucide-react";

type InputMode = "upload" | "paste";

export default function AnalyzePage() {
  const router = useRouter();
  const [mode, setMode] = useState<InputMode>("upload");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setFile(acceptedFiles[0]);
      setError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/msword": [".doc"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
    },
    maxFiles: 1,
    multiple: false,
  });

  async function handleSubmit() {
    setError(null);

    let contractText = text;

    if (mode === "upload") {
      if (!file) {
        setError("Please upload a file first.");
        return;
      }
      contractText = await file.text();
      if (!contractText.trim()) {
        setError(
          "Could not extract text from this file. Try pasting the contract text instead."
        );
        return;
      }
    } else {
      if (!contractText.trim()) {
        setError("Please paste your contract text.");
        return;
      }
    }

    setLoading(true);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: contractText,
          filename: file?.name,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(
          data?.error || `Analysis failed (${res.status}). Please try again.`
        );
      }

      const data = await res.json();
      router.push(`/results/${data.analysisId}`);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="border-b bg-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-blue-600">
            Contract Redliner
          </Link>
        </div>
      </header>

      <main className="flex-1 py-12 px-4">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Upload Your Contract
          </h1>
          <p className="text-gray-600 mb-8">
            Upload a PDF or paste the contract text to get an instant AI
            analysis.
          </p>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setMode("upload")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "upload"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Upload PDF
            </button>
            <button
              onClick={() => setMode("paste")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                mode === "paste"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              Paste Text
            </button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>
                {mode === "upload" ? "Upload File" : "Paste Contract Text"}
              </CardTitle>
              <CardDescription>
                {mode === "upload"
                  ? "Drag and drop or click to select a PDF, DOC, or DOCX file."
                  : "Copy and paste your full contract text below."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {mode === "upload" ? (
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? "border-blue-500 bg-blue-50"
                      : file
                        ? "border-green-500 bg-green-50"
                        : "border-gray-300 hover:border-gray-400"
                  }`}
                >
                  <input {...getInputProps()} />
                  {file ? (
                    <div className="flex flex-col items-center gap-2">
                      <FileText className="w-10 h-10 text-green-600" />
                      <p className="font-medium text-gray-900">{file.name}</p>
                      <p className="text-sm text-gray-500">
                        Click or drag to replace
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-10 h-10 text-gray-400" />
                      <p className="font-medium text-gray-700">
                        {isDragActive
                          ? "Drop your file here"
                          : "Drag & drop your contract here"}
                      </p>
                      <p className="text-sm text-gray-500">
                        or click to browse. PDF, DOC, DOCX accepted.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <Textarea
                  value={text}
                  onChange={(e) => {
                    setText(e.target.value);
                    setError(null);
                  }}
                  placeholder="Paste your contract text here..."
                  className="min-h-[250px] resize-y"
                />
              )}

              {error && (
                <div className="mt-4 flex items-start gap-2 text-red-600 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <p>{error}</p>
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={loading}
                className="w-full mt-6"
                size="lg"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing Contract...
                  </>
                ) : (
                  "Analyze Contract"
                )}
              </Button>
            </CardContent>
          </Card>

          <p className="text-xs text-gray-400 text-center mt-6 max-w-lg mx-auto">
            This tool provides general information only. It is not legal advice.
            Consult a qualified attorney for legal matters.
          </p>
        </div>
      </main>
    </div>
  );
}
