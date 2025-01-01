import { Field, Form } from '@cloudhub-ux/mui/dist/form'

import { Block, FieldBlock, FieldButton, Input } from '@cloudhub-ux/mui'
import { StaticListSelector } from '@cloudhub-ux/mui/dist/mui'
import { MdiMinus, MdiPlus } from '@cloudhub-ux-icons/mdi'
import { Button } from '@cloudhub-ux/shadcn/esm/components/ui/button'

const FilterForm = ({ sampleRow }: { sampleRow: Record<string, any> }) => {
  const columnNames = Object.keys(sampleRow).map((key) => ({
    name: key,
    isJsonBDataType:
      typeof sampleRow[key as keyof typeof sampleRow] === 'object' ||
      Array.isArray(sampleRow[key as keyof typeof sampleRow])
  }))

  const isNumber = (key: string) => {
    return typeof sampleRow[key as keyof typeof sampleRow] === 'number'
  }

  return (
    <Form
      onSubmit={() => {}}
      initialValues={{
        row0: {
          condition: 'AND'
        }
      }}
      render={({ handleSubmit, form, values }) => (
        <Block flex={false}>
          {Object.keys(values || {}).map((key, index) => {
            const isLastRow = index === Object.keys(values || {}).length - 1
            const isFirstRow = index === 0
            const row = values[key] || {}

            const rowKey = `${key}`
            const rowNumber = Number(rowKey.replace('row', ''))

            return (
              <Block row key={key}>
                {!isFirstRow && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-8 h-8 p-1"
                    style={{
                      borderRadius: 8,
                      marginLeft: -32
                    }}
                    onClick={() => {
                      form.change(`${rowKey}.condition`, row.condition === 'AND' ? 'OR' : 'AND')
                    }}
                  >
                    {row.condition}
                  </Button>
                )}
                <Field
                  name={`row${index}.field`}
                  component={StaticListSelector}
                  options={Object.keys(sampleRow)}
                  containerStyle={{
                    width: 150
                  }}
                />
                <Field
                  name={`row${index}.operator`}
                  component={StaticListSelector}
                  containerStyle={{
                    width: 150
                  }}
                  options={[
                    '=',
                    '!=',
                    '>',
                    '<',
                    '>=',
                    '<=',
                    'LIKE',
                    'NOT LIKE',
                    'IN',
                    'NOT IN',
                    'IS NULL',
                    'IS NOT NULL'
                  ]}
                />

                <Field
                  name={`row${index}.value`}
                  component={Input}
                  number={values.field && isNumber(values.field)}
                  containerStyle={{
                    width: 200
                  }}
                />

                {!isLastRow && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-8 h-8 p-1 ml-1"
                    style={{
                      borderRadius: 8
                    }}
                    onClick={() => {
                      console.log('row', rowKey)
                      form.change(`${rowKey}`, undefined)
                    }}
                  >
                    <MdiMinus />
                  </Button>
                )}

                {isLastRow && (
                  <Button
                    variant="outline"
                    size="icon"
                    className="w-8 h-8 p-1 ml-1"
                    style={{
                      borderRadius: 8
                    }}
                    onClick={() => {
                      form.change(`row${rowNumber + 1}`, {
                        condition: 'AND'
                      })
                    }}
                  >
                    <MdiPlus />
                  </Button>
                )}
              </Block>
            )
          })}
        </Block>
      )}
    />
  )
}

export default FilterForm
