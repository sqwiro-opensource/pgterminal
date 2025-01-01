import * as React from 'react';
import { styled } from '@mui/material/styles';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell, { tableCellClasses } from '@mui/material/TableCell';
import TableContainer from '@mui/material/TableContainer';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Paper from '@mui/material/Paper';

import { Text } from '@cloudhub-ux/mui';

const StyledTableCell = styled(TableCell)(({ theme, style }) => ({
  [`&.${tableCellClasses.head}`]: {
    color: theme.palette.common.white,
    ...style
  },
  [`&.${tableCellClasses.body}`]: {
    fontSize: 14,
    padding: '10px',
    ...style
  }
}));

const StyledTableRow = styled(TableRow)(({ theme }) => ({
  '&:nth-of-type(odd)': {
    backgroundColor: theme.palette.action.hover
  },
  // hide last border
  '&:last-child td, &:last-child th': {
    border: 0
  }
}));

const NormalTableRow = styled(TableRow)(({ theme }) => ({
  // hide last border
  '&:last-child td, &:last-child th': {
    border: 0
  }
}));

function createData(name: string, calories: number, fat: number, carbs: number, protein: number) {
  return { name, calories, fat, carbs, protein };
}

const sampleData = [
  createData('Frozen yoghurt', 159, 6.0, 24, 4.0),
  createData('Ice cream sandwich', 237, 9.0, 37, 4.3),
  createData('Eclair', 262, 16.0, 24, 6.0),
  createData('Cupcake', 305, 3.7, 67, 4.3),
  createData('Gingerbread', 356, 16.0, 49, 3.9)
];

export const SimpleTable = function SimpleTable({
  columns = [
    { name: 'Dessert (100g serving)', align: 'left' },
    { name: 'Calories', align: 'right' },
    { name: 'Fat (g)', align: 'right' },
    { name: 'Carbs (g)', align: 'right' },
    { name: 'Protein (g)', align: 'right' }
  ],
  rows = sampleData,
  sx = {}
}: {
  columns: Array<{
    name: string;
    title?: string;
    align?: 'left' | 'right' | 'center';
    component?: 'th' | 'td';
  }>;
  rows: Array<{
    [key: string]: string | number | React.ReactNode;
  }>;
  sx?: any;
}) {
  return (
    <TableContainer component={Paper}>
      <Table sx={{ ...sx }} aria-label="customized table">
        <TableHead>
          <TableRow>
            {columns.map((col) => (
              <StyledTableCell key={col.name} {...(col.align ? { align: col.align } : {})}>
                {col.title || col.name}
              </StyledTableCell>
            ))}
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row, index) => (
            <StyledTableRow key={`${row.name}-${index}`}>
              {columns.map((col) => (
                <StyledTableCell
                  key={col.name}
                  {...(col.align ? { align: col.align } : {})}
                  {...(col.component ? { component: col.component } : {})}
                >
                  {row[col.name]}
                </StyledTableCell>
              ))}
            </StyledTableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

export const KeyValueTable = function KeyValueTable({
  data,
  sx = {},
  keyContainerStyles = {},
  valueContainerStyles = {},
  oddEvenPattern = true
}: {
  data: {
    [key: string]: string | number | React.ReactNode;
  };
  sx?: any;
  keyContainerStyles?: React.CSSProperties;
  valueContainerStyles?: React.CSSProperties;
  oddEvenPattern?: boolean;
}) {
  const TableRow = oddEvenPattern ? StyledTableRow : NormalTableRow;

  return (
    <Table sx={{ ...sx }} aria-label="customized table">
      <TableBody>
        {Object.entries(data).map(([key, value]) => (
          <TableRow key={key}>
            <StyledTableCell
              component="th"
              scope="row"
              style={{
                ...keyContainerStyles
              }}
            >
              <Text bold>{key}</Text>
            </StyledTableCell>
            <StyledTableCell
              align="right"
              style={{
                ...valueContainerStyles
              }}
            >
              {value}
            </StyledTableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
};
