import React, { memo, useEffect, useRef, useState } from "react";

import AutoCompleteInput from "./AutoCompleteInput";
import FormControl from "@material-ui/core/FormControl";
import Grid from "@material-ui/core/Grid";
import IconButton from "@material-ui/core/IconButton";
import Popper from "@material-ui/core/Popper";
import SearchIcon from "@material-ui/icons/Search";
import SearchToggles from "./SearchToggles";
import Tooltip from "@material-ui/core/Tooltip";
import { compose } from "recompose";
import { getSuggestedTerm } from "../reducers/search";
import { makeStyles } from "@material-ui/core/styles";
import qs from "qs";
import { useNavigate } from "@reach/router";
import withLookup from "../hocs/withLookup";
import withSearch from "../hocs/withSearch";
import withSearchDefaults from "../hocs/withSearchDefaults";
import withTaxonomy from "../hocs/withTaxonomy";
import withTypes from "../hocs/withTypes";

export const useStyles = makeStyles((theme) => ({
  icon: {
    color: theme.palette.text.secondary,
    marginRight: theme.spacing(2),
  },
  formControl: {
    marginTop: theme.spacing(2),
    minWidth: "600px",
  },
  search: {
    fontSize: "2em",
    marginLeft: theme.spacing(1),
    backgroundColor: "inherit",
  },
}));

export const PlacedPopper = (props) => {
  return <Popper {...props} placement="bottom" />;
};

const siteName = SITENAME || "GenomeHub";

const suggestedTerm = getSuggestedTerm();

const SearchBox = ({
  lookupTerm,
  setLookupTerm,
  // resetLookup,
  fetchSearchResults,
  setSearchIndex,
  searchDefaults,
  searchIndex,
  searchTerm,
  setPreferSearchTerm,
  taxonomy,
  types,
  synonyms,
}) => {
  const classes = useStyles();
  const navigate = useNavigate();
  const searchBoxRef = useRef(null);
  const searchInputRef = useRef(null);
  let [multiline, setMultiline] = useState(() => {
    if (searchTerm && searchTerm.query && searchTerm.query.match(/[\r\n]/)) {
      return true;
    }
    return false;
  });

  let [result, setResult] = useState(searchIndex);
  let fields = searchTerm.fields || searchDefaults.fields;
  let ranks = searchTerm.ranks || searchDefaults.ranks;
  let names = searchTerm.names || searchDefaults.names;
  const dispatchSearch = (options, term) => {
    if (!options.hasOwnProperty("includeEstimates")) {
      options.includeEstimates = searchDefaults.includeEstimates;
    }
    if (!options.hasOwnProperty("summaryValues")) {
      options.summaryValues = "count";
    }
    if (!options.hasOwnProperty("fields")) {
      options.fields = fields;
    }
    if (!options.hasOwnProperty("ranks")) {
      options.ranks = ranks;
    }
    if (!options.hasOwnProperty("names")) {
      options.names = names;
    }
    options.taxonomy = taxonomy;
    fetchSearchResults(options);
    setPreferSearchTerm(false);
    navigate(`/search?${qs.stringify(options)}#${encodeURIComponent(term)}`);
  };

  const wrap_term = ({ term, taxWrap, result }) => {
    if (result && result == "taxon" && !term.match(/[\(\)<>=]/)) {
      if (!types[term] && !synonyms[term]) {
        term = `${taxWrap}(${term})`;
      }
    }
    return term;
  };

  const doSearch = (queryString, result, hashTerm) => {
    setLookupTerm(queryString);
    let taxWrap = "tax_name";
    if (searchDefaults.includeDescendants) {
      taxWrap = "tax_tree";
    }
    if (!queryString.match("\n")) {
      let query = queryString
        .split(/\s+and\s+/i)
        .map((term) => wrap_term({ term, taxWrap, result }));
      queryString = query.join(" AND ");
      let hash = hashTerm
        .split(/\s+and\s+/i)
        .map((term) => wrap_term({ term, taxWrap, result }));
      hashTerm = hash.join(" AND ");
    }

    setSearchIndex(result);
    dispatchSearch({ query: queryString, result, fields }, hashTerm);
    // resetLookup();
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    let term = searchInputRef.current.value;
    doSearch(term, result, term);
  };

  let searchText = `Type to search ${siteName}`;
  if (searchIndex) {
    searchText += ` ${searchIndex} index`;
  }
  if (suggestedTerm) {
    searchText += ` (e.g. ${suggestedTerm})`;
  }
  return (
    <Grid container alignItems="center" direction="column">
      <Grid item>
        <form
          onSubmit={handleSubmit}
          style={{
            minWidth: "900px",
            width: "100%",
          }}
        >
          <Grid container direction="row" alignItems="center">
            <Grid item xs={2}></Grid>
            <Grid item ref={searchBoxRef} xs={"auto"}>
              <FormControl className={classes.formControl}>
                <AutoCompleteInput
                  inputValue={lookupTerm}
                  setInputValue={setLookupTerm}
                  inputRef={searchInputRef}
                  inputLabel={searchText}
                  multiline={multiline}
                  setMultiline={setMultiline}
                  handleSubmit={handleSubmit}
                  doSearch={doSearch}
                  setResult={setResult}
                  multipart={true}
                />
              </FormControl>
            </Grid>
            <Grid item xs={2}>
              <Tooltip title="Click to search" arrow placement={"top"}>
                <IconButton
                  className={classes.search}
                  aria-label="submit search"
                  type="submit"
                >
                  <SearchIcon />
                </IconButton>
              </Tooltip>
            </Grid>
          </Grid>
        </form>
      </Grid>
      <Grid container direction="row" alignItems="center">
        <Grid item xs={2}></Grid>
        <Grid item xs={8}>
          <SearchToggles />
        </Grid>
        <Grid item xs={2}></Grid>
      </Grid>
    </Grid>
  );
};

export default compose(
  memo,
  withTaxonomy,
  withTypes,
  withSearch,
  withSearchDefaults,
  withLookup
)(SearchBox);
