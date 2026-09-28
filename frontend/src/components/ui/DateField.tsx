import { Controller, type Control, type FieldValues, type Path } from 'react-hook-form';
import { DatePicker, type DatePickerProps } from './DatePicker';

export interface DateFieldProps<T extends FieldValues> extends Omit<DatePickerProps, 'value' | 'onChange'> {
  control: Control<T>;
  name: Path<T>;
}

/** DatePicker bound to a react-hook-form field. */
export function DateField<T extends FieldValues>({ control, name, ...props }: DateFieldProps<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <DatePicker {...props} value={(field.value as string | undefined) ?? ''} onChange={field.onChange} />
      )}
    />
  );
}
