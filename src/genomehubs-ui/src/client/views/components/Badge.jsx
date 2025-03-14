import BadgeInfo, { BadgeInfoCell } from "./BadgeInfo";
import React, { useEffect, useRef, useState } from "react";
import {
  active as activeStyle,
  badgeExpanded as badgeExpandedStyle,
  badgeInfo as badgeInfoStyle,
  badge as badgeStyle,
  bg as bgStyle,
  current as currentStyle,
  disabled as disabledStyle,
  expanded as expandedStyle,
  id as idStyle,
  img as imgStyle,
  links as linksStyle,
  mainInfo as mainInfoStyle,
  maskParent as maskParentStyle,
  name as nameStyle,
  nestedBadge as nestedBadgeStyle,
  nested as nestedStyle,
  rank as rankStyle,
} from "./Styles.scss";

import BadgeStats from "./BadgeStats";
import MoreHorizIcon from "@mui/icons-material/MoreHoriz";
import PhyloPics from "./PhyloPics";
import classNames from "classnames";
import classnames from "classnames";
import { compose } from "recompose";
import { useNavigate } from "@reach/router";
import withBrowse from "../hocs/withBrowse";
import withDescendantsById from "../hocs/withDescendantsById";
import withRecordById from "../hocs/withRecordById";
import withSiteName from "../hocs/withSiteName";
import withTaxonomy from "../hocs/withTaxonomy";

const setScrollPosition = (scrollY, status) => {
  setTimeout(() => {
    if (status.isMounted) {
      window.scrollTo({ top: scrollY });
      if (window.scrollY < scrollY) {
        setScrollPosition(scrollY, status);
      }
    }
  }, 250);
};

const updateScrollPosition = (browse, status) => {
  if (
    browse.scrollY &&
    window.scrollY == 0 &&
    window.scrollY != browse.scrollY
  ) {
    setScrollPosition(browse.scrollY, status);
  }
};

export const Badge = ({
  recordId,
  currentRecordId,
  setRecordId,
  fetchRecord,
  recordIsFetching,
  recordById,
  maskParentElement,
  descendantsById,
  fetchDescendants,
  browse,
  parents,
  setBrowse,
  parentFieldName,
  setParentFieldName,
  updateBrowseStatus,
  depth,
  nestingLevel = 0,
  rank: targetRank,
  size,
  result,
  taxonomy,
  basename,
}) => {
  let scientificName, lineage, rank;
  let topLevel = !parents;
  let currentParents = structuredClone(parents || browse);
  const navigate = useNavigate();

  const imgRef = useRef(null);
  const badgeRef = useRef(null);
  const [height, setHeight] = useState(0);
  const [badgeCss, setBadgeCss] = useState(badgeStyle);
  const [showStats, setShowStats] = useState(
    browse[currentRecordId] && browse[currentRecordId].stats,
  );
  const [showInfo, setShowInfo] = useState(
    browse[currentRecordId] && browse[currentRecordId].info,
  );
  const [showBrowse, setShowBrowse] = useState(
    browse[currentRecordId] && browse[currentRecordId].browse,
  );
  const [browseDiv, setBrowseDiv] = useState(null);
  const [fieldName, setFieldName] = useState(
    parentFieldName || (topLevel && browse.fieldName),
  );
  const setCurrentFieldName = setParentFieldName
    ? (f) => {
        setParentFieldName(f);
        setFieldName(f);
      }
    : setFieldName;

  const fetchMoreDescendants = ({ size, offset, depth }) => {
    fetchDescendants({
      taxonId: currentRecordId,
      taxonomy: taxonomy || "ncbi",
      depth,
      rank: targetRank,
      size,
      offset,
    });
  };

  const expandBrowseDiv = () => {
    setBadgeCss(classnames(badgeStyle, badgeExpandedStyle));
    if (descendantsById && descendantsById.results) {
      let badges = descendantsById.results.map(({ result: descendant }, i) => (
        <WrappedBadge
          key={descendant.taxon_id}
          currentRecordId={descendant.taxon_id}
          maskParentElement={i == descendantsById.count - 1}
          {...{
            parents: {
              ...currentParents,
              ...(descendantsById && {
                [currentRecordId]: { browse: true },
              }),
            },
            parentFieldName: fieldName,
            setParentFieldName: setCurrentFieldName,
            nestingLevel: nestingLevel + 1,
            result,
            taxonomy,
          }}
        />
      ));
      let links = [];

      if (descendantsById.count > descendantsById.results.length) {
        let difference = descendantsById.count - descendantsById.results.length;
        if (difference > 10) {
          links.push(
            <a
              key={10}
              onClick={() => {
                let { scrollY } = window;
                fetchMoreDescendants({
                  offset: descendantsById.results.length,
                  size: 10,
                  depth: descendantsById.depth,
                });

                setBrowse({ ...currentParents, scrollY, fieldName });
              }}
            >
              +10
            </a>,
          );
          if (difference > 100) {
            links.push(
              <a
                key={100}
                onClick={() => {
                  let { scrollY } = window;
                  fetchMoreDescendants({
                    offset: descendantsById.results.length,
                    size: 100,
                    depth: descendantsById.depth,
                  });

                  setBrowse({ ...currentParents, scrollY, fieldName });
                }}
              >
                +100
              </a>,
            );
          }
        }
        links.push(<a key={"all"}>show all</a>);

        badges.push(
          <div style={{ position: "relative" }} key={"showMore"}>
            <div className={badgeCss} ref={badgeRef}>
              <div
                className={bgStyle}
                onClick={() => {
                  if (links.length == 0) {
                    return;
                  }
                  let { scrollY } = window;
                  fetchMoreDescendants({
                    offset: descendantsById.results.length,
                    size: difference,
                    depth: descendantsById.depth,
                  });

                  setBrowse({ ...currentParents, scrollY, fieldName });
                }}
              >
                <div ref={imgRef} className={imgStyle}>
                  <MoreHorizIcon
                    preserveAspectRatio="xMidYMin"
                    style={{ fontSize: "3em" }}
                  />
                </div>
                <div className={rankStyle}></div>
                <div className={idStyle}></div>
                <div className={nameStyle}>{`${difference} tax${
                  difference > 0 ? "a" : "on"
                } not shown`}</div>
                <div className={linksStyle}>{links}</div>
              </div>
              <div className={maskParentStyle}></div>
            </div>
          </div>,
        );
      }
      setBrowseDiv(<>{badges}</>);
    } else {
      setShowBrowse(false);
    }
  };

  const updateBrowse = (parents) => {
    setTimeout(() => {
      setRecordId(currentRecordId);
      window.scrollTo({ top: 0 });
    }, 50);
  };

  useEffect(() => {
    let status = { isMounted: true };
    updateScrollPosition(browse, status);
    if (currentRecordId && recordById) {
      imgRef.current && setHeight(imgRef.current.clientHeight * 0.875);
      if (browse[currentRecordId]) {
        if (browse[currentRecordId].browse) {
          expandBrowseDiv();
        } else if (browse[currentRecordId].stats) {
          setShowStats(true);
        } else if (browse[currentRecordId].info) {
          setShowInfo(true);
        }
      }
    }
    return () => {
      if (topLevel) {
        status.isMounted = false;
        let { scrollY } = window;
        setBrowse({ ...currentParents, scrollY, fieldName });
      }
    };
  }, [descendantsById, fieldName]);
  useEffect(() => {
    let isMounted = true;
    if (currentRecordId && !recordById && !recordIsFetching) {
      setTimeout(() => {
        if (isMounted) {
          fetchRecord({
            recordId: currentRecordId,
            result,
            taxonomy: taxonomy || "ncbi",
          });
          fetchDescendants({
            taxonId: currentRecordId,
            taxonomy: taxonomy || "ncbi",
            depth,
            rank: targetRank,
            size,
          });
        }
      }, 50);
    }
    return () => {
      isMounted = false;
    };
  }, [currentRecordId]);

  if (recordById) {
    ({
      scientific_name: scientificName,
      lineage,
      taxon_rank: rank,
    } = recordById.record);
  }

  if (!scientificName) {
    if (recordById) {
      return null;
    }
    <div className={badgeCss} ref={badgeRef}>
      <div className={bgStyle}></div>
    </div>;
  }

  if (currentRecordId && targetRank && !currentParents[currentRecordId]) {
    currentParents[currentRecordId] = { browse: true };
  }

  const toggleStats = (e) => {
    e.stopPropagation();
    if (!currentParents[currentRecordId]) {
      currentParents[currentRecordId] = {};
    }
    setShowInfo(false);
    currentParents[currentRecordId].info = false;
    currentParents[currentRecordId].stats =
      !currentParents[currentRecordId].stats;
    setShowStats(!showStats);
    updateBrowseStatus(currentRecordId, currentParents[currentRecordId]);
  };

  const toggleInfo = (e) => {
    e.stopPropagation();
    if (!currentParents[currentRecordId]) {
      currentParents[currentRecordId] = {};
    }
    setShowStats(false);
    currentParents[currentRecordId].stats = false;
    currentParents[currentRecordId].info =
      !currentParents[currentRecordId].info;
    setShowInfo(!showInfo);
    updateBrowseStatus(currentRecordId, currentParents[currentRecordId]);
  };

  const toggleBrowse = (recordId) => {
    if (!currentParents[recordId]) {
      currentParents[recordId] = {};
    }
    if (!showBrowse) {
      expandBrowseDiv();
    } else {
      setBadgeCss(badgeStyle);
    }
    currentParents[recordId].browse = !currentParents[recordId].browse;
    setShowBrowse(!showBrowse);
    updateBrowseStatus(currentRecordId, currentParents[currentRecordId]);
  };

  let statsDiv = showStats && (
    <BadgeStats
      currentRecordId={currentRecordId}
      currentRecord={recordById}
      scientificName={scientificName}
      setBrowse={() =>
        updateBrowse({
          ...currentParents,
          [currentRecordId]: {
            ...(currentParents[currentRecordId] || {}),
            stats: true,
          },
        })
      }
      taxonomy={taxonomy}
      result={result}
      rank={rank}
    />
  );

  let infoDiv = showInfo && (
    <BadgeInfo
      currentRecordId={currentRecordId}
      currentRecord={recordById}
      scientificName={scientificName}
      taxonId={currentRecordId}
      setBrowse={() =>
        updateBrowse({
          ...currentParents,
          [currentRecordId]: {
            ...(currentParents[currentRecordId] || {}),
            info: true,
          },
        })
      }
      fieldName={fieldName}
      setFieldName={setCurrentFieldName}
      taxonomy={taxonomy}
      result={result}
      rank={rank}
    />
  );

  let badgeInfoDiv;
  if (recordById && fieldName && recordById.record.attributes[fieldName]) {
    let field = recordById.record.attributes[fieldName];
    badgeInfoDiv = (
      <div
        className={mainInfoStyle}
        // style={{
        //   left: `calc(100% + ${Math.max(10.35 - nestingLevel, 0.35)}em)`,
        // }}
      >
        <div className={badgeInfoStyle}>
          <BadgeInfoCell
            {...{
              field,
              fieldName,
              result,
              tipTitle: `Click to search ${fieldName} values for ${scientificName}`,
              handleClick: () => {
                navigate(
                  `${basename}/search?query=tax_tree%28${scientificName}%5B${currentRecordId}%5D%29%20AND%20${fieldName}&fields=${fieldName}&includeEstimates=true&taxonomy=${taxonomy}&result=${result}`,
                );
                setBrowse();
              },
            }}
          />
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: "relative" }}>
      <div className={badgeCss} ref={badgeRef}>
        {badgeInfoDiv}

        <div
          className={
            currentRecordId == recordId
              ? classNames(bgStyle, currentStyle)
              : bgStyle
          }
          onClick={() => toggleBrowse(currentRecordId)}
        >
          <div ref={imgRef} className={imgStyle}>
            {recordById && (
              <PhyloPics
                taxonId={recordById.record.taxon_id}
                scientificName={recordById.record.scientific_name}
                maxHeight={height}
                hoverHeight={height * 2}
                fixedRatio={1}
                showAncestral={false}
                sourceColors={false}
              />
            )}
          </div>
          <div className={rankStyle}>{rank}</div>
          <div className={idStyle}>{currentRecordId}</div>
          <div className={nameStyle}>{scientificName}</div>
          <div className={linksStyle}>
            {descendantsById &&
            descendantsById.results &&
            descendantsById.count > 0 ? (
              <a
                onClick={(e) => {
                  e.stopPropagation();
                  toggleBrowse(currentRecordId);
                }}
                className={(showBrowse && activeStyle) || ""}
              >
                expand
              </a>
            ) : (
              <a className={disabledStyle}>expand</a>
            )}
            <a
              onClick={toggleStats}
              className={
                showStats ? expandedStyle : scientificName ? "" : disabledStyle
              }
            >
              stats
            </a>
            <a
              onClick={toggleInfo}
              className={
                showInfo ? expandedStyle : scientificName ? "" : disabledStyle
              }
            >
              values
            </a>
            <a
              onClick={(e) => {
                e.stopPropagation();
                navigate(
                  `${basename}/search?query=tax_tree%28${scientificName}%5B${currentRecordId}%5D%29&includeEstimates=true&taxonomy=${taxonomy}&result=${result}`,
                );
                updateBrowse({
                  ...currentParents,
                });
              }}
              className={scientificName ? "" : disabledStyle}
            >
              search
            </a>
          </div>
        </div>
        {maskParentElement && <div className={maskParentStyle}></div>}
        {statsDiv && <div className={nestedStyle}>{statsDiv}</div>}
        {infoDiv && <div className={nestedStyle}>{infoDiv}</div>}
        {showBrowse && <div className={nestedBadgeStyle}>{browseDiv}</div>}
      </div>
    </div>
  );
};

const WrappedBadge = compose(
  withSiteName,
  withTaxonomy,
  withRecordById,
  withDescendantsById,
  withBrowse,
)(Badge);

export default WrappedBadge;
