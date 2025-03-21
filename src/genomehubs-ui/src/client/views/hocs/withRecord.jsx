import {
  getAttributeSettings,
  getCurrentRecord,
  getCurrentRecordId,
  getRecordById,
  getRecordIsFetching,
  getRecords,
  resetRecord,
  setAttributeSettings,
  setCurrentRecordId,
} from "../reducers/record";

import React from "react";
import { connect } from "react-redux";
import { fetchRecord } from "../selectors/record";
import { getLineage } from "../selectors/record";

const withRecord = (WrappedComponent) => (props) => {
  let { currentRecordId } = props;
  const mapStateToProps = (state) => ({
    attributeSettings: getAttributeSettings(state),
    record: getCurrentRecord(state),
    records: getRecords(state),
    recordIsFetching: getRecordIsFetching(state),
    recordId: getCurrentRecordId(state),
    recordById: getRecordById(state, currentRecordId || ""),
    lineage: getLineage(state),
  });

  const mapDispatchToProps = (dispatch) => ({
    fetchRecord: (options) => dispatch(fetchRecord(options)),
    resetRecord: () => dispatch(resetRecord()),
    setRecordId: (recordId) => dispatch(setCurrentRecordId(recordId)),
    setAttributeSettings: (obj) => dispatch(setAttributeSettings(obj)),
  });

  const Connected = connect(
    mapStateToProps,
    mapDispatchToProps,
  )(WrappedComponent);

  return <Connected {...props} />;
};

export default withRecord;
