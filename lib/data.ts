// Reads the data files from disk. Kept separate from checkin.ts so the logic stays pure.
import { readFileSync } from "node:fs";
import path from "node:path";
import { parseCsv, toContacts, toMembers, type Contact, type Member } from "./checkin.ts";

const DATA_DIR = path.join(process.cwd(), "data");

function readDataFile(fileName: string): string {
  return readFileSync(path.join(DATA_DIR, fileName), "utf8");
}

export function loadData(): { members: Member[]; contacts: Contact[]; holidays: string[] } {
  return {
    members: toMembers(parseCsv(readDataFile("members.csv"))),
    contacts: toContacts(parseCsv(readDataFile("last_contacts.csv"))),
    holidays: JSON.parse(readDataFile("holidays.json")),
  };
}
