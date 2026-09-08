/**
 * The goal page's two columns.
 *
 * The sidebar is FIRST in the document and is placed into the second column
 * on a wide screen. On a phone that puts goal health above the day's work,
 * which is the order it should be read in — "at risk, dependencies slipping"
 * is the context for the tasks, and reading it after scrolling past them is
 * reading it too late.
 *
 * Done with grid placement rather than order utilities on purpose: `order`
 * moves the boxes and leaves the DOM alone, so reading order and focus order
 * would disagree with what is on the screen. Here there is one DOM order and
 * both agree with it at every width.
 */
export default function GoalLayout({
  sidebar,
  children,
}: {
  sidebar: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start lg:gap-6">
      <aside aria-label="Goal status" className="space-y-4 lg:col-start-2 lg:row-start-1">
        {sidebar}
      </aside>
      <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">{children}</div>
    </div>
  );
}
