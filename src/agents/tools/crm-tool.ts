import { Type } from "@sinclair/typebox";
import fs from "node:fs/promises";
import path from "node:path";
import { stringEnum } from "../schema/typebox.js";
import { type AnyAgentTool, jsonResult, readStringParam } from "./common.js";

const CRM_ACTIONS = ["log_student", "get_history"] as const;

const CrmToolSchema = Type.Object({
  action: stringEnum(CRM_ACTIONS),
  phone: Type.String({
    description: "Phone number or unique ID of the student",
  }),
  name: Type.Optional(Type.String({ description: "Name of the student" })),
  interest: Type.Optional(
    Type.String({ description: "Major(s) of interest, comma-separated" }),
  ),
  score: Type.Optional(Type.Number({ description: "Exam score" })),
  block: Type.Optional(
    Type.String({ description: "Exam block (A00, D01, etc.)" }),
  ),
  province: Type.Optional(Type.String({ description: "Province/City" })),
  note: Type.Optional(
    Type.String({ description: "Additional notes or summary" }),
  ),
});

const DATA_FILE = "admissions-data/students.jsonl";

interface StudentRecord {
  timestamp: string;
  phone: string;
  name?: string;
  interest?: string;
  score?: number;
  block?: string;
  province?: string;
  note?: string;
}

export function createCrmTool(opts?: { workspaceDir?: string }): AnyAgentTool {
  return {
    label: "CRM",
    name: "crm_log",
    description:
      "Student CRM: log_student (save info after permission) or get_history (recall previous interactions). Use phone as unique ID. Always check get_history at start of conversation to personalize responses.",
    parameters: CrmToolSchema,
    execute: async (_toolCallId, args) => {
      const params = args as Record<string, unknown>;
      const action = readStringParam(params, "action", { required: true });
      const phone = readStringParam(params, "phone", { required: true });
      const workspaceDir = opts?.workspaceDir ?? process.cwd();
      const filePath = path.join(workspaceDir, DATA_FILE);

      switch (action) {
        case "log_student": {
          const entry: StudentRecord = {
            timestamp: new Date().toISOString(),
            phone,
            name: readStringParam(params, "name"),
            interest: readStringParam(params, "interest"),
            score: typeof params.score === "number" ? params.score : undefined,
            block: readStringParam(params, "block"),
            province: readStringParam(params, "province"),
            note: readStringParam(params, "note"),
          };
          // Clean undefined values
          const cleanEntry = Object.fromEntries(
            Object.entries(entry).filter(([_, v]) => v !== undefined),
          );
          // Ensure directory exists
          await fs.mkdir(path.dirname(filePath), { recursive: true });
          await fs.appendFile(filePath, JSON.stringify(cleanEntry) + "\n");
          return jsonResult({
            success: true,
            message: `Đã lưu thông tin${entry.name ? ` của ${entry.name}` : ""}`,
          });
        }
        case "get_history": {
          try {
            const content = await fs.readFile(filePath, "utf-8");
            const lines = content.split("\n").filter((line) => line.trim());
            const records: StudentRecord[] = lines
              .map((line) => {
                try {
                  return JSON.parse(line) as StudentRecord;
                } catch {
                  return null;
                }
              })
              .filter(
                (rec): rec is StudentRecord =>
                  rec !== null && rec.phone === phone,
              );

            if (records.length === 0) {
              return jsonResult({
                found: false,
                message: "Chưa có thông tin về người này",
              });
            }

            // Get the most recent record + merge all data
            const merged: Partial<StudentRecord> = {};
            for (const rec of records) {
              if (rec.name) merged.name = rec.name;
              if (rec.interest) merged.interest = rec.interest;
              if (rec.score) merged.score = rec.score;
              if (rec.block) merged.block = rec.block;
              if (rec.province) merged.province = rec.province;
              if (rec.note) merged.note = (merged.note || "") + "; " + rec.note;
            }

            return jsonResult({
              found: true,
              profile: merged,
              totalInteractions: records.length,
              firstSeen: records[0]?.timestamp,
              lastSeen: records[records.length - 1]?.timestamp,
            });
          } catch {
            return jsonResult({
              found: false,
              message: "Chưa có thông tin về người này",
            });
          }
        }
        default:
          throw new Error(`Unknown action: ${action}`);
      }
    },
  };
}
