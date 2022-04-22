import { Rectangle, Text } from "recharts";

import React from "react";
import formats from "../functions/formats";

const MultiCatLegend = ({ width, x, fill, i, n = 1, name, stats }) => {
  let cellSize = 15;
  let legendWidth = 150;
  let row = Math.floor((width - 100) / legendWidth);

  let j = 1;
  if (i > row) {
    while (j * (row + 1) < i + 1) {
      j++;
    }
    i %= row + 1;
  } else {
    // i += 1;
  }
  if (row >= n) {
    row = n - 1;
  } else if (j > 1 && j * (row + 1) > n) {
    i += j * (row + 1) - n;
  }
  let xPos = x + width - legendWidth * (row - i);

  let text = (
    <g
      key={`cell-${i}`}
      transform={`translate(${-cellSize / 2},${
        cellSize / 2 + (j - 1) * (2 * cellSize + 5)
      })`}
    >
      <Text
        x={-5}
        y={0}
        fill={fill || "rgb(102, 102, 102)"}
        dominantBaseline={"central"}
        textAnchor={"end"}
        fontWeight={"bold"}
      >
        {name}
      </Text>
      {stats && (
        <Text
          x={-5}
          y={cellSize}
          fill={"rgb(102, 102, 102)"}
          dominantBaseline={"central"}
          textAnchor={"end"}
        >
          {`n=${formats(stats.sum, "integer")}${
            stats.sum > 0 && stats.max > stats.min
              ? ` [${formats(stats.min, "integer")}-${formats(
                  stats.max,
                  "integer"
                )}]`
              : ""
          }`}
        </Text>
      )}
      <Rectangle
        key={`cell-${i}`}
        height={cellSize * 2}
        width={cellSize / 2}
        fill={fill || "rgb(102, 102, 102)"}
        x={0} // {props.cx + (w - width) / 2}
        y={-cellSize / 2}
        style={{ pointerEvents: "none" }}
      />
    </g>
  );

  return (
    <g transform={`translate(${x + width - legendWidth * (row - i)}, 5)`}>
      {text}
    </g>
  );
};

export default MultiCatLegend;
