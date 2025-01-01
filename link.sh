#!/bin/bash
rsync -ravu /Users/bernardgaitho/@cloudhub/@cloudhub-ux/mui/dist/ node_modules/@cloudhub-ux/mui/dist/
rsync -ravu /Users/bernardgaitho/@cloudhub/@cloudhub-ux/min/src/ node_modules/@cloudhub-ux/min/src/



rsync -ravu /Users/bernardgaitho/@cloudhub/@cloudhub-ux/cloudhub-ux-graphql/dist/ node_modules/@cloudhub-ux/graphql/dist/
rsync -ravu /Users/bernardgaitho/@cloudhub/@cloudhub-ux/shadcn/src/ node_modules/@cloudhub-ux/shadcn/src/
# rsync -ravu /Users/bernardgaitho/@cloudhub/@cloudhub-iconify/@cloudhub-ux-icons/packages/chub/dist/ node_modules/@cloudhub-ux-icons/chub/dist/
