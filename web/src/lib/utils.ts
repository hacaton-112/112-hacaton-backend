type HOC = (component: React.ReactNode) => React.JSX.Element;
export function compose(...hocs: HOC[]): HOC {
  return (component) =>
    hocs.reduceRight(
      (wrapped, hoc) => hoc(wrapped),
      component,
    ) as React.JSX.Element;
}
