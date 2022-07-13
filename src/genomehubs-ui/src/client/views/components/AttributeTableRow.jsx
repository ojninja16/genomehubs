import React, { Fragment, useState } from "react";

import Box from "@material-ui/core/TableContainer";
import Collapse from "@material-ui/core/Box";
import IconButton from "@material-ui/core/IconButton";
import KeyboardArrowDownIcon from "@material-ui/icons/KeyboardArrowDown";
import KeyboardArrowRightIcon from "@material-ui/icons/KeyboardArrowRight";
import KeyboardArrowUpIcon from "@material-ui/icons/KeyboardArrowUp";
import LaunchIcon from "@material-ui/icons/Launch";
import LocationMap from "./LocationMap";
import NavLink from "./NavLink";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TablePagination from "@material-ui/core/TablePagination";
import TableRow from "@material-ui/core/TableRow";
import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";
import ZoomControl from "./ZoomControl";
import classnames from "classnames";
import { compose } from "recompose";
import { formatter } from "../functions/formatter";
import loadable from "@loadable/component";
import { makeStyles } from "@material-ui/core/styles";
import qs from "../functions/qs";
import styles from "./Styles.scss";
import { useNavigate } from "@reach/router";
import withRecord from "../hocs/withRecord";
import withSearch from "../hocs/withSearch";
import withSiteName from "../hocs/withSiteName";
import withSummary from "../hocs/withSummary";
import withTaxonomy from "../hocs/withTaxonomy";
import withTypes from "../hocs/withTypes";

// const LocationMap = loadable(() => import("./LocationMap"));

const useRowStyles = makeStyles({
  root: {
    "& > *": {
      borderBottom: "unset",
    },
  },
});

const ExternalLink = ({ url, link }) => {
  return (
    <a href={url} target="_blank">
      {link}
      <LaunchIcon fontSize="inherit" />
    </a>
  );
};

const SourceLink = ({ row, types, format = "short" }) => {
  let link, link_url;
  link = row.source || types.source;
  let url_stub = row.source_url_stub || types.source_url_stub;
  let url = row.source_url || types.source_url || types.url;
  let slug;
  if (url_stub) {
    if (row.source_slug) {
      slug = row.source_slug;
      link_url = `${url_stub}${row.source_slug}`;
      if (format == "long") {
        link = `${link} [${row.source_slug}]`;
      }
    } else {
      link_url = url ? url : url_stub;
    }
  } else if (url && !Array.isArray(url)) {
    link_url = url;
  }
  if (link.toLowerCase() == "insdc" && slug && slug.startsWith("GCA_")) {
    return (
      <>
        <ExternalLink
          url={`https://www.ebi.ac.uk/ena/browser/view/${slug}`}
          link={"ENA"}
        />{" "}
        <ExternalLink url={link_url} link={"NCBI"} />
      </>
    );
  }
  return link_url ? <ExternalLink url={link_url} link={link} /> : link;
};

const NestedTable = ({
  values,
  types,
  setPreferSearchTerm,
  taxonomy,
  siteName,
  basename,
}) => {
  const navigate = useNavigate();
  const [page, setPage] = React.useState(0);
  const [rowsPerPage, setRowsPerPage] = React.useState(5);
  const handleChangePage = (event, newPage) => {
    setPage(newPage);
  };

  const handleSourceClick = (recordId, result) => {
    setPreferSearchTerm(false);
    navigate(
      `${basename}/record?recordId=${recordId}&result=${result}&taxonomy=${taxonomy}#${encodeURIComponent(
        recordId
      )}`
    );
  };

  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(+event.target.value);
    setPage(0);
  };
  let hubHeader;
  if (values[0].source_index) {
    hubHeader = <TableCell>{siteName} link</TableCell>;
  }
  return (
    <Box margin={1}>
      <Table size="small" aria-label="raw values">
        <TableHead>
          <TableRow>
            <TableCell>Value</TableCell>
            {hubHeader}
            <TableCell>External source</TableCell>
            <TableCell>Comment</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {values
            .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
            .map((row, i) => {
              let linkCell = (
                <TableCell>
                  <SourceLink row={row} types={types} format={"short"} />
                </TableCell>
              );
              let hubCell;
              if (hubHeader) {
                if (row.source_index) {
                  hubCell = (
                    <Tooltip
                      title={`view ${row.source_index} record`}
                      arrow
                      placement={"top"}
                    >
                      <TableCell
                        onClick={() =>
                          handleSourceClick(row.source_id, row.source_index)
                        }
                        style={{ cursor: "pointer" }}
                      >
                        {row.source_id}
                      </TableCell>
                    </Tooltip>
                  );
                } else {
                  hubCell = <TableCell></TableCell>;
                }
              }
              let comment = row.comment || "";
              if (row.is_primary) {
                comment = `Primary value. ${comment}`;
              }
              let value = row.value;
              if (Array.isArray(value)) {
                value = [...new Set(value)]
                  .sort((a, b) => `${a}`.localeCompare(b))
                  .join(", ");
              }
              return (
                <TableRow key={i}>
                  <TableCell component="th" scope="row">
                    {value}
                  </TableCell>
                  {hubCell}
                  <Tooltip
                    title={
                      row.source ? "open external source" : "no external link"
                    }
                    arrow
                    placement={"top"}
                  >
                    {linkCell}
                  </Tooltip>

                  <TableCell>{comment}</TableCell>
                </TableRow>
              );
            })}
        </TableBody>
      </Table>
      {values.length > 5 && (
        <TablePagination
          rowsPerPageOptions={[5, 10, 25, 100]}
          component="div"
          count={values.length}
          rowsPerPage={rowsPerPage}
          page={page}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
        />
      )}
    </Box>
  );
};

const ValueCell = ({
  attributeId,
  types,
  meta,
  currentResult,
  setHighlightPointLocation,
  zoomPointLocation,
  setZoomPointLocation,
}) => {
  const [open, setOpen] = useState(false);
  let range;
  if (meta.max > meta.min) {
    range = ` (${formatter(meta.min, currentResult)}-${formatter(
      meta.max,
      currentResult
    )})`;
  }
  if (meta.from && meta.to && meta.to > meta.from) {
    range = ` (${formatter(meta.from)} to ${formatter(meta.to)})`;
  }
  let obj = formatter(meta.value, currentResult, "array");
  let valueMeta = types[attributeId]?.value_metadata;
  let defaultDesc, defaultLink;
  if (valueMeta) {
    defaultLink = valueMeta.default?.link;
    defaultDesc = valueMeta.default?.description;
  }
  let links = [];
  let values = obj.values || [];
  values.forEach((value, i) => {
    if (open || i < 5) {
      let lcValue;
      let valueCount = 1;
      try {
        lcValue = value[0].toLowerCase();
        valueCount = value[1];
      } catch (err) {
        lcValue = value[0];
      }
      let link = defaultLink;
      let desc = defaultDesc;
      if (valueMeta && valueMeta[lcValue]) {
        link = valueMeta[lcValue].link || link;
        desc = valueMeta[lcValue].description || desc;
      }
      let entry = <b>{obj.formatted[i]}</b>;
      if (link) {
        entry = (
          <NavLink url={link.replaceAll(/\{\}/g, value[0])}>{entry}</NavLink>
        );
      } else if (attributeId == "sample_location") {
        entry = <ZoomControl value={lcValue}>{entry}</ZoomControl>;
      }
      entry = (
        <span key={i}>
          {entry}
          {valueCount > 1 ? ` (${valueCount})` : ""}
          {i < 4 ? (i < values.length - 1 ? "; " : "") : open ? "; " : ""}
        </span>
      );
      if (desc) {
        entry = (
          <Tooltip key={i} title={desc} arrow placement={"top"}>
            {entry}
          </Tooltip>
        );
      }
      links.push(entry);
    }
  });
  if (obj && obj.extra) {
    let title = open ? "Show less" : `Show ${obj.extra} more`;
    links.push(
      <span key={"extra"}>
        {open ? "" : "; "}
        <Tooltip title={title} arrow placement={"top"}>
          <span style={{ cursor: "pointer" }} onClick={() => setOpen(!open)}>
            {open ? "<<" : "..."}
          </span>
        </Tooltip>{" "}
      </span>
    );
  }
  return (
    <TableCell>
      {links}
      {range}
    </TableCell>
  );
};

const AttributeTableRow = ({
  attributeId,
  taxonId,
  meta,
  currentResult,
  types,
  setSummaryField,
  setHighlightPointLocation,
  setZoomPointLocation,
  zoomPointLocation,
  setPreferSearchTerm,
  taxonomy,
  siteName,
  basename,
}) => {
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);

  const handleAncestorClick = (fieldId, ancTaxonId, depth) => {
    // setSummaryField(fieldId);
    // setPreferSearchTerm(false);
    // navigate(
    //   `explore?taxon_id=${taxonId}&result=${currentResult}&field_id=${fieldId}${location.hash}`
    // );
    let options = {
      query: `tax_tree(${ancTaxonId})`,
      result: currentResult,
      includeEstimates: false,
      fields: fieldId,
      summaryValues: "count",
      taxonomy,
    };
    if (depth) {
      options.query += ` AND tax_depth(${depth})`;
      options.includeEstimates = true;
      options.excludeAncestral = [fieldId];
    }
    navigate(
      `${basename}/search?${qs.stringify(options)}#${encodeURIComponent(
        options.query
      )}`
    );
  };

  const handleDescendantClick = (fieldId, depth) => {
    let options = {
      query: `tax_tree(${taxonId})`,
      result: currentResult,
      includeEstimates: false,
      fields: fieldId,
      summaryValues: "count",
      taxonomy,
    };
    if (depth) {
      options.query += ` AND tax_depth(${depth})`;
      options.includeEstimates = true;
      options.excludeAncestral = [fieldId];
    }
    navigate(
      `${basename}/search?${qs.stringify(options)}#${encodeURIComponent(
        options.query
      )}`
    );
  };

  const classes = useRowStyles();
  let fieldKeys = [];
  let fieldValues = [];
  let raw;
  let zoom;
  let geoPoints;

  if (attributeId) {
    if (attributeId == "sample_location") {
      if (!Array.isArray(meta.value)) {
        geoPoints = [meta.value];
      } else {
        geoPoints = meta.value;
      }
      zoom = 10;
    }

    const keys = [
      { key: "value", display: "value" },
      { key: "count", display: "n" },
      { key: "min", display: "min" },
      { key: "max", display: "max" },
      { key: "mean", display: "mean" },
      { key: "median", display: "median" },
      { key: "mode", display: "mode" },
      { key: "list", display: "list" },
      { key: "aggregation_source", display: "source" },
    ];
    const confidence = {
      direct: "High",
      descendant: "Medium",
      ancestor: "Low",
    };
    let source;
    let aggSource;
    let colSpan = 2;
    let label = <span>{attributeId}</span>;
    if (types[attributeId]?.description) {
      label = (
        <Tooltip title={types[attributeId].description} arrow placement={"top"}>
          {label}
        </Tooltip>
      );
    }
    fieldValues.push(<TableCell key={"attribute"}>{label}</TableCell>);
    fieldValues.push(
      <ValueCell
        key={"value"}
        attributeId={attributeId}
        types={types}
        meta={meta}
        currentResult={currentResult}
        setHighlightPointLocation={setHighlightPointLocation}
        zoomPointLocation={zoomPointLocation}
        setZoomPointLocation={setZoomPointLocation}
      />
    );
    if (currentResult == "taxon") {
      let source = meta.aggregation_source;
      let handleClick = () => {};
      let ofWord = meta.aggregation_method == "list" ? "from" : "of";
      let valuesWord = meta.aggregation_method == "list" ? "lists" : "values";
      let tipText = `${meta.aggregation_method} ${ofWord} ${meta.count}`;
      if (source == "ancestor") {
        tipText += ` immediate descendant node ${valuesWord} for ancestral ${meta.aggregation_rank}`;
        handleClick = () =>
          handleAncestorClick(attributeId, meta.aggregation_taxon_id, 1);
      } else if (source == "descendant") {
        tipText += ` immediate descendant node ${valuesWord}`;
        handleClick = () => handleDescendantClick(attributeId, 1);
      } else if (source == "direct") {
        tipText += " direct values";
        handleClick = () => setOpen(!open);
      }
      // fieldValues.push(
      //   <TableCell
      //     key={"count"}
      //     onClick={handleClick}
      //     style={{ cursor: "pointer" }}
      //   >
      //     {meta.count}
      //   </TableCell>
      // );
      fieldValues.push(
        <TableCell key={"method"}>
          <Tooltip title={tipText} arrow placement={"top"}>
            <span onClick={handleClick} style={{ cursor: "pointer" }}>
              {" "}
              {meta.aggregation_method} ({meta.count})
            </span>
          </Tooltip>{" "}
        </TableCell>
      );

      if (meta.aggregation_source) {
        let css;
        let icons = [];

        source = meta["aggregation_source"];
        css = classnames(
          styles.underscore,
          styles[`underscore${confidence[source]}`]
        );
        aggSource = formatter(source);
        let altCss = classnames(
          styles.underscore,
          styles[`underscore${confidence["descendant"]}`]
        );
        let altAggSource = formatter("descendant");
        if (source == "direct") {
          icons.push(
            <span key="direct" className={styles.disableTheme}>
              <IconButton
                aria-label="expand row"
                size="small"
                onClick={() => setOpen(!open)}
              >
                {open ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
              </IconButton>
            </span>
          );
        }
        if (source == "descendant" || meta.has_descendants) {
          icons.push(
            <span key="descendant" className={styles.disableTheme}>
              <IconButton
                aria-label="show descendant values"
                size="small"
                onClick={() => handleDescendantClick(attributeId)}
              >
                <KeyboardArrowRightIcon />
              </IconButton>
            </span>
          );
        } else if (source == "ancestor") {
          icons.push(
            <span key="ancestor" className={styles.disableTheme}>
              <IconButton
                aria-label="show ancestral values"
                size="small"
                onClick={() =>
                  handleAncestorClick(attributeId, meta.aggregation_taxon_id)
                }
              >
                <KeyboardArrowRightIcon />
              </IconButton>
            </span>
          );
          if (meta.aggregation_rank) {
            aggSource = (
              <Tooltip
                title={`source rank: ${meta.aggregation_rank}`}
                arrow
                placement={"top"}
              >
                <span>{aggSource}</span>
              </Tooltip>
            );
          }
        }

        fieldValues.push(
          <TableCell
            key={"aggregation_source"}
            style={{ whiteSpace: "nowrap" }}
          >
            <span className={css}>{aggSource}</span>
            {icons[0]}
            {icons[1] && (
              <>
                <span className={altCss}>{altAggSource}</span> {icons[1]}
              </>
            )}
          </TableCell>
        );
        colSpan++;
      }

      if (source == "direct") {
        let values = [];
        if (meta.values) {
          values = meta.values;
        } else if (
          meta.aggregation_method &&
          meta.aggregation_method == "unique"
        ) {
          values = [meta];
        }
        if (values.length > 0) {
          raw = (
            <TableRow>
              <TableCell></TableCell>
              <TableCell
                style={{ paddingBottom: 0, paddingTop: 0 }}
                colSpan={colSpan}
              >
                <Collapse in={open.toString()} timeout="auto">
                  <NestedTable
                    types={types[attributeId]}
                    values={values}
                    setPreferSearchTerm={setPreferSearchTerm}
                    taxonomy={taxonomy}
                    siteName={siteName}
                    basename={basename}
                  />
                </Collapse>
              </TableCell>
            </TableRow>
          );
        }
      }
    } else if (meta.source) {
      fieldValues.push(
        <TableCell key={"source"} style={{ whiteSpace: "nowrap" }}>
          <SourceLink row={meta} types={types} />
        </TableCell>
      );
    }
  }
  let header = (
    <span className={styles.title}>
      {attributeId}
      {meta && meta.units && <span> ({meta.units})</span>}
    </span>
  );
  if (meta && meta.description) {
    header = (
      <Tooltip title={meta.description} arrow placement={"top"}>
        {header}
      </Tooltip>
    );
  }
  return (
    <Fragment>
      <TableRow className={classes.root}>{fieldValues}</TableRow>
      {open && raw}

      {zoom && (
        <TableRow>
          <TableCell colSpan={5}>
            <LocationMap
              taxonId={taxonId}
              geoPoints={geoPoints}
              zoom={zoom}
              meta={meta}
            />
          </TableCell>
        </TableRow>
      )}
    </Fragment>
  );
};

export default compose(
  withSiteName,
  withTaxonomy,
  withRecord,
  withSummary,
  withSearch,
  withTypes
)(AttributeTableRow);
