import React, { memo, useEffect } from "react";

import FileModal from "./FileModal";
import Grid from "@mui/material/Grid2";
import NavLink from "./NavLink";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import { autoWidth as autoWidthStyle } from "./Styles.scss";
import { compose } from "recompose";
import formatter from "../functions/formatter";
import makeStyles from "@mui/styles/makeStyles";
import withApi from "../hocs/withApi";
import withFiles from "../hocs/withFiles";
import withFilesByAnalysisId from "../hocs/withFilesByAnalysisId";

const useStyles = makeStyles((theme) => ({
  pale: {
    opacity: 0.6,
  },
  tableRow: {
    verticalAlign: "top",
  },
}));

const FileTable = ({
  analysisId,
  analysisMeta,
  apiUrl,
  files,
  filesByAnalysisId,
  fetchFiles,
}) => {
  useEffect(() => {
    if (analysisId && !files.isFetching && !filesByAnalysisId) {
      let query = `analysis_id==${analysisId}`;
      let result = "file";
      fetchFiles({ query, result });
    }
  }, [analysisId, filesByAnalysisId]);
  const classes = useStyles();
  if (!analysisId) {
    return null;
  }

  let tableRows;
  if (filesByAnalysisId) {
    tableRows = filesByAnalysisId.map((meta) => {
      let externalLink;
      if (meta.source_url) {
        externalLink = (
          <NavLink href={meta.source_url}>
            {meta.source || analysisMeta.source || analysisMeta.name}
          </NavLink>
        );
      } else if (analysisMeta.source_url) {
        externalLink = (
          <NavLink href={analysisMeta.source_url}>
            {analysisMeta.source || analysisMeta.name}
          </NavLink>
        );
      }
      let previewLink = `${apiUrl}/download?recordId=${meta.file_id}&preview=true&streamFile=true`;
      let downloadLink = `${apiUrl}/download?recordId=${meta.file_id}&filename=${meta.name}`;
      return (
        <TableRow key={meta.title} className={classes.tableRow}>
          <TableCell>{meta.title}</TableCell>
          <TableCell>
            <FileModal meta={meta} link={externalLink}>
              <img style={{ cursor: "pointer" }} src={previewLink} />
            </FileModal>
          </TableCell>
          <TableCell>
            <a href={downloadLink}>
              {meta.name} (
              <span style={{ textDecoration: "underline" }}>{`${formatter(
                meta.size_bytes
              )}B`}</span>
              )
            </a>
          </TableCell>
          <TableCell>
            <Grid container direction="column">
              <Grid>
                <span className={classes.pale}>dimensions: </span>
                {meta.size_pixels}
              </Grid>
              <Grid>
                <span className={classes.pale}>description: </span>
                {meta.description}
              </Grid>
              {externalLink && (
                <Grid>
                  <span className={classes.pale}>source: </span>
                  {externalLink}
                </Grid>
              )}
            </Grid>
          </TableCell>
        </TableRow>
      );
    });
  }
  let tableHead = (
    <TableHead>
      <TableRow>
        <TableCell>Title</TableCell>
        <TableCell>Preview</TableCell>
        <TableCell>Download</TableCell>
        <TableCell>Info</TableCell>
      </TableRow>
    </TableHead>
  );
  return (
    <Table size={"small"} className={autoWidthStyle}>
      {tableHead}
      <TableBody>{tableRows}</TableBody>
    </Table>
  );
};

export default compose(
  memo,
  withApi,
  withFiles,
  withFilesByAnalysisId
)(FileTable);
