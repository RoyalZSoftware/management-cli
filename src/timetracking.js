import { ID } from "./id.js";
import { TestStorage } from "./storage.js";

const timeTrackingEntries = [];
let currentTimeTrackingEntry = undefined;

/**
 * @typedef {Object} TimeTrackingEntry
 * @property {string} description
 * @property {Date} $createdAt
 * @property {Date} start
 * @property {Date} end
 */

const saveTimeTrackingEntries = (storage = TestStorage) => {
  const last = timeTrackingEntries[timeTrackingEntries.length - 1];

  if (last?.end == undefined)
    currentTimeTrackingEntry = last;
  storage().save(
    "timeTrackingEntries",
    timeTrackingEntries.map((c) => {
      return {
        ...c,
      };
    })
  );
};

export const loadTimeTrackingEntries = (storage = TestStorage) => {
  const loaded = storage().load("timeTrackingEntries");
  if (loaded == undefined) return;
  loaded.forEach((timeTrackingEntry) => {
    timeTrackingEntries.push({
      ...timeTrackingEntry,
    });
  });

  const last = timeTrackingEntries[timeTrackingEntries.length - 1];

  if (last?.end == undefined)
    currentTimeTrackingEntry = last;
};

export function newTimeTrackingEntry(
  description,
  start = undefined,
  end = undefined
) {
  return {
    $createdAt: new Date(),
    description,
    start: start ?? new Date(),
    end: end,
  };
}

export function startTimeTracking(description) {
  if (currentTimeTrackingEntry != undefined) throw new Error("Already running.");
  
  const entry = newTimeTrackingEntry(description);

  currentTimeTrackingEntry = entry;
  storeTimeTrackingEntry(currentTimeTrackingEntry)
  return entry;
}

export function stopTimeTracking() {
  if (currentTimeTrackingEntry == undefined) throw new Error("Not running.");

  currentTimeTrackingEntry.end = new Date();

  updateTimeTrackingEntry(currentTimeTrackingEntry);

  const en = currentTimeTrackingEntry;

  currentTimeTrackingEntry = undefined;
  return en;
}


export const storeTimeTrackingEntry = (entry) => {
  timeTrackingEntries.push({$id: ID(), ...entry});
  saveTimeTrackingEntries();
};

const updateTimeTrackingEntry = (entry) => {
  if (entry.$id === undefined) throw new Error("Cant update without $id.");

  const foundEntry = timeTrackingEntries.find(c => c.$id === entry.$id)
  if (foundEntry == undefined) throw new Error('Not found.');

  Object.assign(foundEntry, entry);

  saveTimeTrackingEntries();
}

export const getTimeTrackingEntries = () => timeTrackingEntries;