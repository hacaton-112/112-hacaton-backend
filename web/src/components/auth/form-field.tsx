import { Flex, Text } from "@bolid-ui/themes";
import type { ReactNode } from "react";

interface FormFieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  children: ReactNode;
}

export function FormField({ label, htmlFor, error, children }: FormFieldProps) {
  return (
    <Flex direction="column" gap="1">
      <Text as="label" htmlFor={htmlFor} size="1" color="gray">
        {label}
      </Text>
      {children}
      {error && (
        <Text size="1" color="red" role="alert">
          {error}
        </Text>
      )}
    </Flex>
  );
}
