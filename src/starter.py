import csv
import json
from datetime import datetime, timezone

# === Clique Home Assignment Starter (Python) ===
# You may freely modify this file or start from scratch.
# The data files are located in ../data/

DATA_PATH = "../data"

def load_data():
    with open(f"{DATA_PATH}/members.csv") as f:
        members = list(csv.DictReader(f))
    with open(f"{DATA_PATH}/last_contacts.csv") as f:
        last_contacts = list(csv.DictReader(f))
    with open(f"{DATA_PATH}/holidays.json") as f:
        holidays = json.load(f)
    return members, last_contacts, holidays

def calculate_due_members(members, last_contacts, holidays):
    # TODO: Implement logic from the assignment
    # 1. Determine who needs a check-in
    # 2. Compute priority_score
    # 3. Sort and return list
    return []

def main():
    members, last_contacts, holidays = load_data()
    results = calculate_due_members(members, last_contacts, holidays)
    print("Members due for check-in:")
    for m in results:
        print(m)

if __name__ == "__main__":
    main()
