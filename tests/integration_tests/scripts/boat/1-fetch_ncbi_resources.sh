#!/bin/bash

ROOT_TAXON=Amphiesmenoptera
ROOT_TAXID=85604
FILE_PATH=tests/integration_tests/data/boat/assembly-data
CONFIG=tests/integration_tests/config/boat.yaml

# # Download NCBI datasets executable
# curl https://ftp.ncbi.nlm.nih.gov/pub/datasets/command-line/LATEST/mac/datasets > datasets
# chmod a+x datasets

# # Download NCBI datasets zip for ROOT_TAXON
# mkdir -p $FILE_PATH
# datasets download genome taxon "$ROOT_TAXON" \
#    --no-progressbar \
#    --dehydrated \
#    --filename $FILE_PATH/$ROOT_TAXON.zip

# # Unzip NCBI datasets zip
# unzip -o -d $FILE_PATH \
#    $FILE_PATH/$ROOT_TAXON.zip

# Parse NCBI datasets
genomehubs parse --ncbi-datasets-genome $FILE_PATH \
   --outfile $FILE_PATH/ncbi_datasets_$ROOT_TAXON.tsv.gz

# Filter assembly fetch file
ACC_COL=$(gunzip -c $FILE_PATH/ncbi_datasets_$ROOT_TAXON.tsv.gz \
    | head -n 1 \
    | awk -v b="genbankAssmAccession" '{for (i=1;i<=NF;i++) { if ($i == b) { print i } }}')
ACCESSIONS=$(gunzip -c $FILE_PATH/ncbi_datasets_$ROOT_TAXON.tsv.gz \
    | tail -n +2 \
    | cut -f $ACC_COL)
if [ -f $FILE_PATH/organelles.tsv ]; then
  cp $FILE_PATH/organelles.tsv $FILE_PATH/organelles.tsv.prev
  ACCESSIONS=$(echo "$ACCESSIONS" | grep -wvFf <(cut -f 1 $FILE_PATH/organelles.tsv.prev))
fi

mkdir -p $FILE_PATH/organelles/ncbi_dataset
grep sequence_report $FILE_PATH/ncbi_dataset/fetch.txt \
    | grep -wFf <(echo "$ACCESSIONS") \
    > $FILE_PATH/organelles/ncbi_dataset/fetch.txt

datasets rehydrate --directory $FILE_PATH/organelles

if [ -s $FILE_PATH/organelles.tsv.prev ]; then
  mv $FILE_PATH/organelles.tsv.prev $FILE_PATH/organelles.tsv
else
  printf "assemblyAccession\tgenBankAccession\tmoleculeType\tgcPortion\tlength\n" > $FILE_PATH/organelles.tsv
fi
while read ACC; do
  JSONL=$FILE_PATH/organelles/ncbi_dataset/data/$ACC/sequence_report.jsonl
  if [ -s "$JSONL" ]; then
    LINES=$(grep '"assemblyUnit":"non-nuclear"' $JSONL)
    if [ ! -z "$LINES" ]; then
      while read JSON; do
        echo $JSON | jq -r '["'$ACC'", .genbankAccession, .assignedMoleculeLocationType, ((.gcCount | tonumber) / (.length | tonumber) | .*10000 | round | ./10000), .length] | @tsv' >> $FILE_PATH/organelles.tsv
      done <<< "$LINES"
    fi
  fi
done <<< "$ACCESSIONS"


# # Clean up expanded ncbi datasets zip
# rm -rf $FILE_PATH/ncbi_dataset \
#    $FILE_PATH/$ROOT_TAXON.zip

# Delete existing indices
curl -X DELETE "http://localhost:9201/*"

# Run genomehubs init
genomehubs init \
    --taxonomy-source ncbi \
    --config-file $CONFIG \
    --taxonomy-ncbi-root $ROOT_TAXID \
    --taxon-preload

curl -s -X PUT "localhost:9201/assembly--ncbi--boat--2021.10.15/_settings" \
          -H 'Content-Type: application/json' \
          -d '{ "index.mapping.nested_objects.limit" : 100000 }'

curl -s -X PUT "localhost:9201/taxon--ncbi--boat--2021.10.15/_settings" \
          -H 'Content-Type: application/json' \
          -d '{ "index.mapping.nested_objects.limit" : 100000 }'

# Run genomehubs index assembly assembly-data
genomehubs index \
    --taxonomy-source ncbi \
    --config-file $CONFIG \
    --assembly-dir $FILE_PATH