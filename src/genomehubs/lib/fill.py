#!/usr/bin/env python3

"""
Fill attribute values.

Usage:
    genomehubs fill [--hub-name STRING] [--hub-path PATH] [--hub-version PATH]
                    [--config-file PATH...] [--config-save PATH]
                    [--es-host URL...]
                    [--traverse-infer-ancestors] [--traverse-infer-descendants]
                    [--traverse-infer-both]
                    [--traverse-root STRING] [--traverse-weight STRING]
                    [-h|--help] [-v|--version]

Options:
    --hub-name STRING             GenomeHubs instance name.
    --hub-path PATH               GenomeHubs instance root directory path.
    --hub-version STR             GenomeHubs instance version string.
    --config-file PATH            Path to YAML file containing configuration options.
    --config-save PATH            Path to write configuration options to YAML file.
    --es-host URL                 ElasticSearch hostname/URL and port.
    --traverse-infer-ancestors    Flag to enable tree traversal from tips to root.
    --traverse-infer-descendants  Flag to enable tree traversal from root to tips.
    --traverse-infer-both         Flag to enable tree traversal from tips to root and
                                  back to tips.
    --traverse-root ID            Root taxon id for tree traversal.
    --traverse-weight STRING      Weighting scheme for setting values during tree
                                  traversal.
    -h, --help                    Show this
    -v, --version                 Show version number

Examples:
    # 1. Traverse tree up to taxon_id 7088
    ./genomehubs fill --traverse-root 7088
"""

import math
import sys
from collections import defaultdict
from statistics import mean
from statistics import median
from statistics import median_high
from statistics import median_low
from statistics import mode

from docopt import docopt
from tolkein import tolog

from ..lib import hub
from ..lib import taxon
from .attributes import fetch_types
from .config import config
from .es_functions import index_stream
from .es_functions import launch_es
from .es_functions import stream_template_search_results
from .version import __version__

LOGGER = tolog.logger(__name__)


def get_max_depth(es, *, index):
    """Find max depth of root lineage."""
    body = {
        "id": "max_nested_value",
        "params": {"path": "lineage", "field": "node_depth"},
    }
    res = es.search_template(index=index, body=body)
    max_depth = res["aggregations"]["depths"]["max_depth"]["value"]
    return max_depth


def get_max_depth_by_lineage(es, *, index, root):
    """Find max depth of specified root lineage."""
    body = {
        "id": "max_nested_value_by_key_value",
        "params": {
            "path": "lineage",
            "key": "taxon_id",
            "value": root,
            "field": "node_depth",
        },
    }
    res = es.search_template(index=index, body=body)
    max_depth = res["aggregations"]["depths"]["root"]["max_depth"]["value"]
    return max_depth


def stream_nodes_by_root_depth(es, *, index, root, depth, size=10):
    """Get entries by depth of root taxon."""
    if depth > 0:
        body = {
            "id": "taxon_attributes_by_root_depth",
            "params": {"taxon_id": root, "depth": depth},
        }
        return stream_template_search_results(es, index=index, body=body, size=size)
    body = {
        "id": "taxon_attributes_by_taxon_id",
        "params": {"taxon_id": root},
    }
    return stream_template_search_results(es, index=index, body=body)


def stream_descendant_nodes_missing_attributes(es, *, index, attributes, root, size=10):
    """Get entries descended from root that lack one or more attributes."""
    id_list = set()
    for attribute in attributes:
        body = {
            "id": "taxon_missing_attribute_by_ancestor_id",
            "params": {"taxon_id": root, "attribute": attribute["key"]},
        }
        for result in stream_template_search_results(
            es, index=index, body=body, size=size
        ):
            if result["_id"] not in id_list:
                yield result


def apply_summary(summary, values, *, max_value=None, min_value=None):
    """Apply summary statistic functions."""
    summaries = {
        "count": len,
        "max": max,
        "min": min,
        "mean": mean,
        "median": median,
        "median_high": median_high,
        "median_low": median_low,
        "mode": mode,
        "most_common": mode,
        "list": list,
    }
    flattened = []
    for v in values:
        if isinstance(v, list):
            flattened += v
        else:
            flattened.append(v)
    value = summaries[summary](flattened)
    if summary == "max":
        if max_value is not None:
            value = max(value, max_value)
        max_value = value
    if summary == "min":
        if min_value is not None:
            value = min(value, min_value)
        min_value = value
    return value, max_value, min_value


def summarise_attribute_values(
    attribute, meta, *, values=None, max_value=None, min_value=None
):
    """Calculate a single summary value for an attribute."""
    if values is None and "values" not in attribute:
        return None, None, None
    if "summary" in meta:
        value_type = "%s_value" % meta["type"]
        if "values" in attribute:
            if values is None:
                values = [value[value_type] for value in attribute["values"]]
            else:
                values += [value[value_type] for value in attribute["values"]]
        if not values:
            return None, None, None
        idx = 0
        traverse = meta.get("traverse", False)
        traverse_value = None
        if not isinstance(meta["summary"], list):
            meta["summary"] = [meta["summary"]]
        for summary in meta["summary"]:
            value, max_value, min_value = apply_summary(
                summary, values, max_value=max_value, min_value=min_value
            )
            if idx == 0:
                attribute[value_type] = value
                attribute["count"] = len(values)
                attribute["aggregation_method"] = summary
                attribute["aggregation_source"] = "direct"
                traverse_value = value
            elif traverse and summary == traverse:
                traverse_value = value
            if summary != "list":
                if summary.startswith("median"):
                    summary = "median"
            else:
                traverse_value = list(set(traverse_value))
            idx += 1
        return traverse_value, max_value, min_value
    return None, None, None


def summarise_attributes(*, attributes, attrs, meta, parent, parents):
    """Set attribute summary values."""
    changed = False
    for node_attribute in attributes:
        if node_attribute["key"] in attrs:
            summary_value, max_value, min_value = summarise_attribute_values(
                node_attribute, meta[node_attribute["key"]]
            )
            if summary_value is not None:
                changed = True
                if parent is not None:
                    # print(node_attribute["key"])
                    # print(parents[parent][node_attribute["key"]]["values"])
                    # print(summary_value)
                    if isinstance(summary_value, list):
                        parents[parent][node_attribute["key"]][
                            "values"
                        ] += summary_value
                    else:
                        parents[parent][node_attribute["key"]]["values"].append(
                            summary_value
                        )
                    if max_value is not None:
                        parents[parent][node_attribute["key"]]["max"] = max(
                            parents[parent][node_attribute["key"]]["max"], max_value
                        )
                    if min_value is not None:
                        parents[parent][node_attribute["key"]]["min"] = min(
                            parents[parent][node_attribute["key"]]["min"], min_value
                        )
    return changed


def set_values_from_descendants(
    *, attributes, descendant_values, meta, parent, parents
):
    """Set attribute summary values from descendant values."""
    changed = False
    for key, obj in descendant_values.items():
        try:
            attribute = next(entry for entry in attributes if entry["key"] == key)
        except StopIteration:
            attribute = {"key": key}
            attributes.append(attribute)
        summary_value, max_value, min_value = summarise_attribute_values(
            attribute,
            meta[key],
            values=obj["values"],
            max_value=obj["max"],
            min_value=obj["min"],
        )
        if summary_value is not None:
            attribute["aggregation_source"] = "descendant"
            changed = True
            if parent is not None:
                if isinstance(summary_value, list):
                    parents[parent][key]["values"] += summary_value
                else:
                    parents[parent][key]["values"].append(summary_value)
                if max_value is not None:
                    parents[parent][key]["max"] = max(
                        parents[parent][key]["max"], max_value
                    )
                if min_value is not None:
                    parents[parent][key]["min"] = min(
                        parents[parent][key]["min"], min_value
                    )
    return changed


def traverse_from_tips(es, opts, *, template):
    """Traverse a tree, filling in values."""
    root = opts["traverse-root"]
    max_depth = get_max_depth_by_lineage(es, index=template["index_name"], root=root,)
    root_depth = max_depth
    meta = template["types"]["attributes"]
    attrs = set(meta.keys())
    print(attrs)
    parents = defaultdict(
        lambda: defaultdict(
            lambda: {"max": float("-inf"), "min": float("inf"), "values": []}
        )
    )
    while root_depth >= 0:
        nodes = stream_nodes_by_root_depth(
            es, index=template["index_name"], root=root, depth=root_depth, size=50,
        )
        ctr = 0
        for node in nodes:
            ctr += 1
            changed = False
            if "attributes" in node["_source"]:
                changed = summarise_attributes(
                    attributes=node["_source"]["attributes"],
                    attrs=attrs,
                    meta=meta,
                    parent=node["_source"].get("parent", None),
                    parents=parents,
                )
            if node["_source"]["taxon_id"] in parents:
                if "attributes" not in node["_source"]:
                    node["_source"]["attributes"] = []
                changed = set_values_from_descendants(
                    attributes=node["_source"]["attributes"],
                    descendant_values=parents[node["_source"]["taxon_id"]],
                    meta=meta,
                    parent=node["_source"].get("parent", None),
                    parents=parents,
                )
            if changed:
                yield node["_id"], node["_source"]
        root_depth -= 1


def copy_attribute_summary(source, meta):
    """Copy an attribute summary, removing values."""
    dest = {}
    print(source)
    for key in meta["summary"]:
        if key.startswith("median") and "median" in source:
            dest["median"] = source["median"]
        elif key != "list" and key in source:
            dest[key] = source[key]
    dest["%s_value" % meta["type"]] = source["%s_value" % meta["type"]]
    dest["count"] = source["count"]
    dest["key"] = source["key"]
    return dest


def stream_missing_attributes_at_level(es, *, nodes, attrs, template, level=1):
    """Stream all descendant nodes with missing attributes."""
    for node in nodes:
        taxon_id = node["_source"]["taxon_id"]
        fill_attrs = []
        if "attributes" in node["_source"]:
            for attribute in node["_source"]["attributes"]:
                if attribute["key"] in attrs:
                    fill_attrs.append(attribute)
        if not fill_attrs:
            continue
        meta = template["types"]["attributes"]
        desc_nodes = stream_descendant_nodes_missing_attributes(
            es,
            index=template["index_name"],
            attributes=fill_attrs,
            root=taxon_id,
            size=50,
        )
        anc_attributes = {attr["key"]: attr for attr in fill_attrs}
        for desc_node in desc_nodes:
            skip_attrs = set()
            if "attributes" in desc_node["_source"]:
                for desc_attribute in desc_node["_source"]["attributes"]:
                    if desc_attribute["key"] in anc_attributes:
                        skip_attrs.add(desc_attribute["key"])
            else:
                desc_node["_source"]["attributes"] = []
            for key, anc_attribute in anc_attributes.items():
                if key not in skip_attrs:
                    desc_attribute = copy_attribute_summary(anc_attribute, meta[key])
                    desc_attribute["aggregation_method"] = meta[key]["traverse"]
                    desc_attribute["aggregation_source"] = "ancestor"
                    desc_node["_source"]["attributes"].append(desc_attribute)
            yield desc_node["_id"], desc_node["_source"]


def traverse_from_root(es, opts, *, template):
    """Traverse a tree, filling in values."""
    root = opts["traverse-root"]
    max_depth = get_max_depth_by_lineage(es, index=template["index_name"], root=root,)
    root_depth = max_depth - 1
    meta = template["types"]["attributes"]
    attrs = set({})
    for key, value in meta.items():
        if "traverse" in value and value["traverse"]:
            if (
                "traverse_direction" not in value
                or value["traverse_direction"] != "ancestor"
            ):
                attrs.add(key)
    # parents = defaultdict(lambda: defaultdict(list))
    while root_depth >= 0:
        LOGGER.info("Filling values at root depth %d" % root_depth)
        nodes = stream_nodes_by_root_depth(
            es, index=template["index_name"], root=root, depth=root_depth, size=50,
        )
        desc_nodes = stream_missing_attributes_at_level(
            es, nodes=nodes, attrs=attrs, template=template
        )
        index_stream(
            es, template["index_name"], desc_nodes, _op_type="update",
        )
        root_depth -= 1


def main(args):
    """Initialise genomehubs."""
    options = config("fill", **args)
    if "traverse-infer-both" in options["fill"]:
        options["fill"]["traverse-infer-ancestors"] = True
        options["fill"]["traverse-infer-descendants"] = True

    # Start Elasticsearch
    es = launch_es(options["fill"])

    # Post search scripts
    hub.post_search_scripts(es)

    LOGGER.info("Filling values")

    types = fetch_types(es, "taxon", options["fill"])

    if "taxonomy-source" in options["fill"]:
        for taxonomy_name in options["fill"]["taxonomy-source"]:
            template = taxon.index_template(taxonomy_name, options["fill"])
            if types:
                template["types"]["attributes"] = types
            if "traverse-root" in options["fill"]:
                if "traverse-infer-ancestors" in options["fill"]:
                    LOGGER.info("Inferring ancestral values")
                    index_stream(
                        es,
                        template["index_name"],
                        traverse_from_tips(es, options["fill"], template=template),
                        _op_type="update",
                    )
                if "traverse-infer-descendants" in options["fill"]:
                    LOGGER.info("Inferring descendant values")
                    traverse_from_root(es, options["fill"], template=template)


def cli():
    """Entry point."""
    if len(sys.argv) == sys.argv.index(__name__.split(".")[-1]) + 1:
        args = docopt(__doc__, argv=[])
    else:
        args = docopt(__doc__, version=__version__)
    main(args)


if __name__ == "__main__":
    cli()
