import { attrTypes } from "./attrTypes";
import { logError } from "./logger";

export const parseFields = async ({ result, fields, taxonomy }) => {
  let typesMap = await attrTypes({ result, taxonomy });
  try {
    if (!typesMap) {
      return [];
    }
    if (!fields || fields == "undefined") {
      fields = Object.keys(typesMap)
        .map((key) => key.toLowerCase())
        .filter((key) => typesMap[key] && typesMap[key].display_level == 1);
    } else if (!fields || fields == "all") {
      fields = Object.keys(typesMap);
    } else if (fields == "none") {
      fields = [];
    } else if (!Array.isArray(fields)) {
      fields = (fields || "").split(/\s*,\s*/);
    }
    return fields.map((key) => key.toLowerCase());
  } catch (message) {
    logError({ req, message });
    return typesMap ? Object.keys(typesMap) : [];
  }
};
