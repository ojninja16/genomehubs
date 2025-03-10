import { formatJson } from "../functions/formatJson.js";
import { getRecordsById } from "../functions/getRecordsById.js";
import { logError } from "../functions/logger.js";

export const getRecords = async (req, res) => {
  // try {
  let response = {};
  response = await getRecordsById(req.query);
  return res.status(200).send(formatJson(response, req.query.indent));
  // } catch (message) {
  //   logError({ req, message });
  //   return res.status(400).send({ status: "error" });
  // }
};
