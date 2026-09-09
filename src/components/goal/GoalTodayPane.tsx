"use client";

import { useState } from "react";
import GoalTaskList, { type GoalTaskView } from "./GoalTaskList";
import CompletedTaskList, { type CompletedTaskView } from "./CompletedTaskList";

/**
 * The Today tab's two lists, and the one thing they have to agree about.
 *
 * Completed Tasks is collapsed by default, so a finished task used to appear
 * to evaporate: the row left the list and nothing said where it went. The
 * confirmation in the list above names the destination, and this opens the
 * destination so the task is actually there when the user looks.
 *
 * It opens only on a completion, and it never closes itself again — someone
 * who then collapses the section meant it.
 */
export default function GoalTodayPane({
  tasks,
  summary,
  visibleCount,
  completed,
}: {
  tasks: GoalTaskView[];
  summary: string;
  visibleCount: number;
  completed: CompletedTaskView[];
}) {
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <>
      <GoalTaskList
        tasks={tasks}
        summary={summary}
        visibleCount={visibleCount}
        onCompleted={() => setHistoryOpen(true)}
      />
      <CompletedTaskList tasks={completed} open={historyOpen} onOpenChange={setHistoryOpen} />
    </>
  );
}
