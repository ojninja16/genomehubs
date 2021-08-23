#!/usr/bin/env python3
"""Hub functions."""

import csv
import os
import re
import sys
from collections import defaultdict
from copy import deepcopy
from pathlib import Path

from tolkein import tofile
from tolkein import tolog

LOGGER = tolog.logger(__name__)
MIN_INTEGER = -(2 ** 31)
MAX_INTEGER = 2 ** 31 - 1


def setup(opts):
    """Set up directory for this GenomeHubs instance and handle reset."""
    Path(opts["hub-path"]).mkdir(parents=True, exist_ok=True)
    return True


def load_types(name, *, part="types"):
    """Read a types file from the templates directory."""
    script_dir = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    types = None
    try:
        types_file = os.path.join(script_dir, "templates", "%s.%s.yaml" % (name, part))
        types = tofile.load_yaml(types_file)
        try:
            for key, value in types.items():
                try:
                    enum = set(
                        [str(option).lower() for option in value["constraint"]["enum"]]
                    )
                    value["constraint"]["enum"] = enum
                except KeyError:
                    pass
        except AttributeError:
            pass
    except Exception:
        pass
    if types and "file" in types and "attributes" in types:
        for key, value in types["file"].items():
            for attr in types["attributes"].values():
                if key not in ("format", "header", "name") and key not in attr:
                    attr[key] = value
    return types


def index_templator(parts, opts):
    """Index template helper function."""
    script_dir = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    mapping_file = os.path.join(script_dir, "templates", parts[0] + ".json")
    types = load_types(parts[0])
    names = load_types(parts[0], part="names")
    template = {
        "name": parts[0],
        "index_name": opts["hub-separator"].join(parts),
        "mapping": tofile.load_yaml(mapping_file),
        "types": types,
        "names": names,
    }
    return template


def add_names_to_types(names, types):
    """Add names field meta to type field meta."""
    sources = 0
    if types is not None:
        types = deepcopy(types)
        sources += 1
    elif names is not None:
        types = deepcopy(names)
        sources += 1
    if sources == 2:
        for group, entries in names.items():
            if group not in types:
                types[group] = deepcopy(entries)
            else:
                for field, attrs in entries.items():
                    if isinstance(attrs, dict):
                        if field not in types[group]:
                            types[group][field] = deepcopy(attrs)
                        elif types[group][field]["header"] != attrs["header"]:
                            types[group]["names_%s" % field] = deepcopy(attrs)
    return types


def order_parsed_fields(parsed, types, names=None):
    """Order parsed fields using a template file."""
    columns = {}
    fields = {}
    ctr = 0
    types = add_names_to_types(names, types)
    for group, entries in types.items():
        for field, attrs in entries.items():
            header = False
            try:
                for key, value in attrs.items():
                    if key == "index":
                        if value not in columns:
                            columns.update({value: field})
                            fields.update({field: value})
                    elif key == "header":
                        header = value
                if header and header not in fields:
                    columns.update({ctr: header})
                    fields.update({header: ctr})
                    ctr += 1
            except AttributeError:
                pass
    order = [x[0] for x in sorted(fields.items(), key=lambda x: x[1])]
    data = [order]
    for entry in parsed:
        row = [entry.get(field, "None") for field in order]
        data.append(row)
    return data


def post_search_scripts(es):
    """POST ElasticSearch search scripts."""
    script_dir = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
    search_script_dir = os.path.join(script_dir, "templates", "scripts")
    directory = os.fsencode(search_script_dir)
    for script_file in os.listdir(directory):
        filename = os.fsdecode(script_file)
        if filename.endswith(".json"):
            body = tofile.load_yaml(os.path.join(search_script_dir, filename))
            script_id = filename.replace(".json", "")
            with tolog.DisableLogger():
                es.put_script(id=script_id, body=body)


def byte_type_constraint(value):
    """Test byte_type constraint."""
    if value >= -128 and value <= 128:
        return True
    return False


def integer_type_constraint(value):
    """Test integer_type constraint."""
    if value >= MIN_INTEGER and value <= MAX_INTEGER:
        return True
    return False


def short_type_constraint(value):
    """Test short_type constraint."""
    if value >= -32768 and value <= 32767:
        return True
    return False


def min_value_constraint(value, limit):
    """Test minimum value constraint."""
    if value >= limit:
        return True
    return False


def max_value_constraint(value, limit):
    """Test maximum value constraint."""
    if value <= limit:
        return True
    return False


def enum_constraint(value, enum):
    """Test value in predefined set constraint."""
    if str(value).lower() in enum:
        return True
    return False


def test_constraint(value, constraint):
    """Test value against constraint."""
    constraints = {
        "byte": byte_type_constraint,
        "integer": integer_type_constraint,
        "short": short_type_constraint,
        "min": min_value_constraint,
        "max": max_value_constraint,
        "enum": enum_constraint,
    }
    for key in constraint:
        if key in constraints:
            if not constraints[key](value, constraint[key]):
                return False
    return True


def convert_lat_lon(location):
    """Convert lat and lon to array notation."""
    if isinstance(location, list):
        return ",".join(location)
    if location.endswith(("E", "W")):
        sign = {"N": "", "E": "", "S": "-", "W": "-"}
        parts = re.split(r"\s*([NESW])\s*", location)
        string = "%s%s,%s%s" % (sign[parts[1]], parts[0], sign[parts[3]], parts[2])
        return string
    if location:
        return None
    return ""


def convert_to_type(key, value, to_type):
    """Convert values to type."""
    if to_type in {"byte", "integer", "long", "short"}:
        try:
            value = int(value)
        except ValueError:
            value = None
    elif to_type in {
        "double",
        "float",
        "half_float",
        "1dp",
        "2dp",
        "3dp",
        "4dp",
    }:
        try:
            value = float(value)
        except ValueError:
            value = None
    elif to_type == "geo_point":
        value = convert_lat_lon(value)
    else:
        value = str(value)
    # if value is None:
    #     LOGGER.warning(
    #         "%s value %s is not a valid %s", key, str(value), to_type,
    #     )
    return value


def calculator(value, operation):
    """Template-based calculator."""
    value1, operator, value2 = operation.split(" ")
    if value1 == "{}":
        value1 = float(value)
        value2 = float(value2)
    elif value2 == "{}":
        value2 = float(value)
        value1 = float(value1)
    if operator == "+":
        return value1 + value2
    elif operator == "-":
        return value1 - value2
    elif operator == "*":
        return value1 * value2
    elif operator == "/":
        try:
            return value1 / value2
        except ZeroDivisionError:
            return None
    elif operator == "%":
        if operator == "%":
            return value1 % value2
    else:
        return None


def validate_values(values, key, types):
    """Validate values."""
    validated = []
    key_type = types[key]["type"]
    for value in values:
        if "function" in types[key]:
            try:
                value = calculator(value, types[key]["function"])
            except ValueError:
                continue
        value = convert_to_type(key, value, key_type)
        if value is None:
            continue
        if isinstance(value, str):
            if not value:
                continue
            try:
                value = types[key]["translate"][value]
            except KeyError:
                pass
        try:
            valid = test_constraint(value, key_type)
            if valid:
                valid = test_constraint(value, types[key]["constraint"])
        except KeyError:
            valid = True
        if valid:
            validated.append(value)
        elif value:
            LOGGER.warning("%s is not a valid %s value", str(value), key)
    return validated


def apply_value_template(prop, value, attribute, *, taxon_types, has_taxon_data):
    """Set value using template."""
    template = re.compile(r"^(.*?\{\{)(.+)(\}\}.*)$")
    new_prop = prop.replace("taxon_", "")
    match = template.match(str(value))
    if match:
        groups = match.groups()
        if groups[1] and groups[1] in attribute:
            has_taxon_data = True
            new_value = attribute[groups[1]]
            if groups[0] != "{{":
                new_value = "%s%s" % (
                    groups[0].replace("{{", ""),
                    str(new_value),
                )
            if groups[2] != "}}":
                new_value = "%s%s" % (
                    str(new_value),
                    groups[2].replace("}}", ""),
                )
            taxon_types.update({new_prop: new_value})
            taxon_types.update({"group": "taxon"})
            if prop in taxon_types:
                del taxon_types[prop]
    else:
        has_taxon_data = True
        taxon_types.update({new_prop: value})
        taxon_types.update({"group": "taxon"})
        if prop in taxon_types:
            del taxon_types[prop]
    return has_taxon_data


def add_attributes(
    entry, types, *, attributes=None, source=None, attr_type="attributes", meta=None
):
    """Add attributes to a document."""
    if attributes is None:
        attributes = []
    taxon_attributes = []
    taxon_types = {}
    if meta is None:
        meta = {}
    attribute_values = {}
    for key, values in entry.items():
        if key in types:
            if not isinstance(values, list):
                values = [values]
            validated = validate_values(values, key, types)
            # TODO: handle invalid values
            if validated:
                if len(validated) == 1:
                    validated = validated[0]
                if attr_type == "attributes":
                    attribute = {"key": key, "%s_value" % types[key]["type"]: validated}
                    attribute_values.update({key: attribute})
                else:
                    attribute = {"identifier": validated, "class": key}
                attribute.update(meta)
                if "source" in types[key]:
                    attribute.update({"source": types[key]["source"]})
                elif source is not None:
                    attribute.update({"source": source})
                attributes.append(attribute)
    if attribute_values:
        for attribute in attributes:
            has_taxon_data = False
            taxon_attribute = {**attribute, "source_index": "assembly"}
            taxon_attribute_types = {**types[attribute["key"]]}
            # taxon_props = []
            for prop, value in types[attribute["key"]].items():
                if prop.startswith("taxon_"):
                    has_taxon_data = apply_value_template(
                        prop,
                        value,
                        attribute,
                        taxon_types=taxon_attribute_types,
                        has_taxon_data=has_taxon_data,
                    )
                    # taxon_props.append(prop)
            # for prop in taxon_props:
            #     del types[attribute["key"]][prop]
            if has_taxon_data:
                taxon_attribute.update({"key": taxon_attribute_types["name"]})
                # taxon_attribute.update({"name": taxon_attribute_types["key"]})
                taxon_attributes.append(taxon_attribute)
                taxon_types.update(
                    {taxon_attribute_types["name"]: taxon_attribute_types}
                )
    return attributes, taxon_attributes, taxon_types


def chunks(arr, n):
    """Yield successive n-sized chunks from arr."""
    for i in range(0, len(arr), n):
        yield arr[i : i + n]


def add_attribute_values(existing, new, *, raw=True):
    """Add attribute values to records."""
    indices = {}
    for index, entry in enumerate(existing):
        indices[entry["key"]] = index
    index = len(existing)
    for group in new:
        if not isinstance(group, list):
            group = [group]
        for entry in group:
            if raw:
                arr = []
                if indices and entry["key"] in indices:
                    try:
                        arr = existing[indices[entry["key"]]]["values"]
                    except KeyError:
                        LOGGER.error(
                            "Unable to import values to an attribute (%s) that has already been filled",
                            entry["key"],
                        )
                        exit(1)
                else:
                    existing.append({"key": entry["key"], "values": arr})
                    indices[entry["key"]] = index
                    index += 1
                del entry["key"]
                arr.append(entry)
            else:
                existing.append(
                    {
                        **entry,
                        "count": 1,
                        "aggregation_method": "unique",
                        "aggregation_source": "direct",
                    }
                )


def strip_comments(data, types):
    """Strip comment lines from a file stream."""
    comment_chars = {"#"}
    if "file" in types and "comment" in types["file"]:
        comment_chars.update(set(types["file"]["comment"]))
    for row in data:
        if row[0] in comment_chars:
            continue
        yield row


def process_names_file(types, names_file):
    """Process a taxon names file."""
    data = tofile.open_file_handle(names_file)
    names = defaultdict(dict)
    if data is None:
        return names
    delimiters = {"csv": ",", "tsv": "\t"}
    rows = csv.reader(
        strip_comments(data, types),
        delimiter=delimiters[types["file"]["format"]],
        quotechar='"',
    )
    next(rows)
    for row in rows:
        name = row[3] if len(row) > 3 else row[1]
        names[row[2]][row[1]] = {"name": name, "taxon_id": row[0]}
    return names


def validate_types_file(types_file, dir_path):
    """Validate types file."""
    LOGGER.info("Validating YAML file %s", types_file)
    try:
        types = tofile.load_yaml(str(types_file.resolve()))
    except Exception:
        LOGGER.error("Unable to open types file %s", str(types_file.resolve()))
        sys.exit(1)
    if "taxonomy" not in types:
        LOGGER.error("Types file contains no taxonomy information")
        sys.exit(1)
    if "file" not in types or "name" not in types["file"]:
        LOGGER.error("No data file name in types file")
        sys.exit(1)
    if "attributes" in types:
        for entry in types["attributes"].values():
            enum = entry.get("constraint", {}).get("enum", [])
            if enum:
                entry["constraint"]["enum"] = [value.lower() for value in enum]
    defaults = {"attributes": {}, "metadata": {}}
    for key, value in types["file"].items():
        if key.startswith("display") or key.startswith("taxon"):
            defaults["attributes"].update({key: value})
        elif key.startswith("source"):
            defaults["attributes"].update({key: value})
            defaults["metadata"].update({key: value})
    types.update({"defaults": defaults})
    datafile = Path(dir_path) / types["file"]["name"]
    data = tofile.open_file_handle(datafile)
    if data is None:
        LOGGER.error("Data file '%s' could not de opened for reading", datafile)
        sys.exit(1)
    names = process_names_file(types, Path(dir_path) / "names" / types["file"]["name"])
    return types, data, names


def set_xrefs(taxon_names, types, row, *, meta=None):
    """Set xrefs for taxon_names."""
    if meta is None:
        meta = {}
    names = []
    for name_class, value in taxon_names.items():
        taxon = {"name": value, "class": name_class}
        if "xref" in types[name_class] and types[name_class]["xref"]:
            if "source" in meta:
                taxon.update({"source": meta["source"]})
            if "source_stub" in meta:
                taxon.update({"source_stub": meta["source_stub"]})
        names.append(taxon)
    return names


def set_row_defaults(types, data):
    """Set default values for a row."""
    for key in types["defaults"].keys():
        if key in types:
            for entry in types[key].values():
                entry = {
                    **types["defaults"][key],
                    **entry,
                }
        elif key == "metadata":
            data["metadata"] = {**types["defaults"]["metadata"]}


def process_row_values(row, types, data):
    """Process row values."""
    for group in data.keys():
        if group in types:
            for key, meta in types[group].items():
                if "index" not in meta:
                    continue
                try:
                    if isinstance(meta["index"], list):
                        char = meta.get("join", "")
                        values = [row[i] for i in meta["index"]]
                        if all(values):
                            value = char.join(values)
                        else:
                            continue
                    else:
                        value = row[meta["index"]]
                    if "separator" in meta and any(
                        sep in value for sep in meta["separator"]
                    ):
                        separator = "|".join(meta["separator"])
                        data[group][key] = re.split(rf"\s*{separator}\s*", value)
                    else:
                        data[group][key] = value
                except Exception as err:
                    LOGGER.warning("Cannot parse row '%s'" % str(row))
                    raise err


def process_row(types, names, row):
    """Process a row of data."""
    data = {
        "attributes": {},
        "identifiers": {},
        "metadata": {},
        "taxon_names": {},
        "taxonomy": {},
        "taxon_attributes": {},
    }
    set_row_defaults(types, data)
    process_row_values(row, types, data)
    taxon_data = {}
    taxon_types = {}
    if "is_primary_value" in data["metadata"]:
        try:
            data["metadata"]["is_primary_value"] = bool(
                int(data["metadata"]["is_primary_value"])
            )
        except ValueError:
            data["metadata"]["is_primary_value"] = False
    assembly_id = None
    if (
        "identifiers" in data
        and data["identifiers"]
        and "assembly_id" in data["identifiers"]
        and data["identifiers"]["assembly_id"]
    ):
        assembly_id = data["identifiers"]["assembly_id"]
    for attr_type in list(["attributes", "identifiers"]):
        if attr_type in data and data[attr_type]:
            (
                data[attr_type],
                taxon_data[attr_type],
                taxon_types[attr_type],
            ) = add_attributes(
                data[attr_type],
                types[attr_type],
                attr_type=attr_type,
                meta=data["metadata"],
            )
        else:
            data[attr_type] = []
    if assembly_id is not None:
        if "attributes" in taxon_data and taxon_data["attributes"]:
            for attr in taxon_data["attributes"]:
                attr.update(
                    {
                        "source_index": "assembly",
                        "source_id": assembly_id,
                    }
                )
    if data["taxon_names"]:
        data["taxon_names"] = set_xrefs(
            data["taxon_names"], types["taxon_names"], row, meta=data["metadata"]
        )
    if data["taxonomy"] and names:
        for key in names.keys():
            if key in data["taxonomy"]:
                if data["taxonomy"][key] in names[key]:
                    data["taxonomy"]["_taxon_id"] = names[key][data["taxonomy"][key]][
                        "taxon_id"
                    ]
                    data["taxonomy"][key] = names[key][data["taxonomy"][key]]["name"]
    return data, taxon_data, taxon_types.get("attributes", {})


def set_column_indices(types, header):
    """Use header to set indices for named columns."""
    headers = {title: index for index, title in enumerate(header)}
    for section, entries in types.items():
        for key, value in entries.items():
            if isinstance(value, dict):
                if "header" in value:
                    index = headers.get(value["header"], None)
                    if index is not None:
                        value.update({"index": index})


def write_imported_rows(rows, opts, *, types, header=None, label="imported"):
    """Write imported rows to processed file."""
    file_key = "%s-exception" % opts["index"]
    dir_key = "%s-dir" % opts["index"]
    if file_key in opts and opts[file_key]:
        outdir = opts[file_key]
    else:
        outdir = "%s/%s" % (opts[dir_key], label)
    os.makedirs(outdir, exist_ok=True)
    outfile = "%s/%s" % (outdir, types["file"]["name"])
    data = []
    header_len = 0
    if header is not None:
        data.append(header)
        header_len = 1
    if isinstance(rows, dict):
        for row_set in rows.values():
            for row in row_set:
                data.append(row)
    else:
        for row in rows:
            data.append(row)
    LOGGER.info(
        "Writing %d records to %s file '%s'", len(data) - header_len, label, outfile
    )
    tofile.write_file(outfile, data)


def write_spellchecked_taxa(spellings, opts, *, types):
    """Write spellchecked taxa to file."""
    dir_key = "%s-dir" % opts["index"]
    filepath = Path(types["file"]["name"])
    extensions = "".join(filepath.suffixes)
    file_basename = str(filepath).replace(extensions, "")
    dirs = {
        "spellcheck": "exceptions",
        "synonym": "imported",
    }
    for group in dirs.keys():
        taxa = []
        for name, obj in spellings[group].items():
            taxa.append([obj["taxon_id"], name, obj["rank"]] + obj["matches"])
        if taxa:
            outdir = "%s/%s" % (opts[dir_key], dirs[group])
            os.makedirs(outdir, exist_ok=True)
            outfile = "%s/%s" % (outdir, "%s.spellcheck.tsv" % file_basename)
            LOGGER.info(
                "Writing %d %s suggestions to spellcheck file '%s'",
                len(taxa),
                group,
                outfile,
            )
            tofile.write_file(
                outfile, [["taxon_id", "input", "rank", "suggested"]] + taxa
            )


def write_imported_taxa(taxa, opts, *, types):
    """Write imported taxa to file."""
    imported = []
    file_key = "%s-exception" % opts["index"]
    dir_key = "%s-dir" % opts["index"]
    filepath = Path(types["file"]["name"])
    extensions = "".join(filepath.suffixes)
    file_basename = str(filepath).replace(extensions, "")
    for name, arr in taxa.items():
        prefix = "#" if len(arr) > 1 else ""
        for obj in arr:
            imported.append(
                ["%s%s" % (prefix, str(obj["taxon_id"])), name, obj["rank"]]
            )
    if imported:
        if file_key in opts and opts[file_key]:
            outdir = opts[file_key]
        else:
            outdir = "%s/imported" % opts[dir_key]
        os.makedirs(outdir, exist_ok=True)
        outfile = "%s/%s" % (outdir, "%s.taxon_ids.tsv" % file_basename)
        LOGGER.info(
            "Writing %d taxon_ids to imported file '%s'",
            len(imported),
            outfile,
        )
        tofile.write_file(outfile, [["taxon_id", "input", "rank"]] + imported)
