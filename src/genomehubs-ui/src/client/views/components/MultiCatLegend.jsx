import { Rectangle, Text } from "recharts";

import React from "react";
import formats from "../functions/formats";

export const processLegendData = ({ bounds, yBounds, width }) => {
  let translations = {};
  let catTranslations = {};
  let catOffsets = {};
  let legendRows = 0;
  let yTranslations = {};

  if (bounds?.stats?.cats) {
    for (let cat of bounds.stats.cats) {
      translations[cat.key] = cat.label;
    }
  }
  if (yBounds?.stats?.cats) {
    for (let cat of yBounds.stats.cats) {
      yTranslations[cat.key] = cat.label;
    }
  }
  if (bounds?.cats) {
    let catOffset = 0;
    let len = bounds.cats.length;
    let row = 1;
    let charWidth = 8;
    let minWidth = 150;
    let previousCats = [];
    for (let i = 0; i < len; i++) {
      let cat = bounds.cats[i];
      let labelWidth = Math.max((cat.label.length + 2) * charWidth, minWidth);
      if (labelWidth + catOffset < width - 50) {
        catOffsets[cat.label] = { offset: 0, row };
        for (let prevCat of previousCats) {
          catOffsets[prevCat].offset += labelWidth;
        }
        previousCats.push(cat.label);
        catOffset += labelWidth;
      } else {
        if (catOffset > 0) {
          row++;
        }
        catOffsets[cat.label] = { offset: 0, row };
        if (labelWidth > width - 50) {
          catOffset = 0;
          row++;
        } else {
          catOffset = labelWidth;
        }
        previousCats = [cat.label];
      }
    }
    for (let cat of bounds.cats) {
      catTranslations[cat.key] = cat.label;
    }
    legendRows = row;
  }
  return {
    translations,
    catTranslations,
    catOffsets,
    legendRows,
    yTranslations,
  };
};

const MultiCatLegend = ({
  width,
  x,
  fill,
  i,
  n = 1,
  name,
  stats,
  legendWidth = 150,
  offset,
  row,
}) => {
  let cellSize = 15;
  let xPos;
  let j = 1;
  if (offset || offset === 0) {
    xPos = x + width - offset;
    j = row;
  } else {
    row = Math.floor((width - 50) / legendWidth);
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
    xPos = x + width - legendWidth * (row - i);
  }

  let value;
  if (stats) {
    if (stats.sum) {
      value = (
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
      );
    } else if (stats.count) {
      value = (
        <text
          x={-5}
          y={cellSize}
          fill={"rgb(102, 102, 102)"}
          dominantBaseline={"central"}
          textAnchor={"end"}
        >
          {/* <tspan>{"n="}</tspan> */}
          <tspan fill={fill}>{formats(stats.count, "integer")}</tspan>
          {stats.total && (
            <tspan>{` / ${formats(stats.total, "integer")}`}</tspan>
          )}
        </text>
      );
    }
  }

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
      {value}
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

  return <g transform={`translate(${xPos}, 5)`}>{text}</g>;
};

export default MultiCatLegend;
