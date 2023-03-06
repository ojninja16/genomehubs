import { generateQuery } from "./generateQuery";
import { indexName } from "./indexName";
import { logError } from "./logger";

export const chainQueries = async ({
  query,
  result,
  chainThreshold = 500,
  ...params
}) => {
  let matches = query.matchAll(/(query[A-Z]+).(\w+(:?\(\w+\))*)/g);
  if (!matches) {
    return false;
  }

  for (let match of matches) {
    let parentQuery = params[match[1]];
    if (!parentQuery) {
      throw Error(`${match[1]} is not defined`);
    }
    let [result, str] = parentQuery.split("--");
    if (!str) {
      str = result;
      result = "taxon";
    }
    let [summary, fields] = match[2].split(/[\(\)]/);
    if (!fields) {
      fields = summary;
      summary = "value";
    }
    let res = await getResults({
      ...params,
      query: str,
      size: chainThreshold,
      fields,
      result,
    });
    if (!res.status.success) {
      return { status: res.status };
    }
    if (res.status.hits == 0) {
      throw Error(`${match[1]} returns no hits`);
    }
    if (res.status.hits > chainThreshold) {
      throw Error(`${match[1]} returns over ${chainThreshold} hits`);
    }
    let values = res.results.flatMap((obj) => {
      if (obj.result.fields && obj.result.fields.hasOwnProperty(fields)) {
        return obj.result.fields[fields][summary];
      } else if (obj.result.hasOwnProperty(fields)) {
        return obj.result[fields];
      } else {
        throw Error(`Could not find value for ${match[1]}.${fields}`);
      }
    });
    query = query.replace(match[0], values.join(","));
  }
  return query;
};

export const getResults = async (params) => {
  try {
    if (params.query == "null") {
      params.size = 0;
    } else {
      params.query = await chainQueries(params);
    }
  } catch (error) {
    logError({ req: params.req, message: error });
    return {
      func: () => ({
        status: { success: false, error: error.message },
      }),
      params: {},
      status: { success: false, error: error.message },
    };
  }
  let index = indexName({ ...params });
  let query = await generateQuery({ ...params, index });
  return query.func({ index, ...query.params });
};
