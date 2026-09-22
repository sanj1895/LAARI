import { Db } from "mongodb";

let db: Db | null = null;

//Called once when the server starts
export function initDB(database: Db) {
  db = database;
}

//Reusable access to the reports collection
export function getReportsCollection() {
  if (!db) {
    throw new Error("Database not initialized");
  }

  return db.collection("reports");
}

import { RiskReport } from "./types";

export async function saveRiskReport(report: RiskReport) {
  const collection = getReportsCollection();

  const result = await collection.insertOne({
    ...report,
    createdAt: report.createdAt ?? new Date(),
  });

  return result.insertedId;
}

