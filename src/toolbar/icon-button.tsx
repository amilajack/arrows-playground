import { HTMLProps, memo } from "react";
import state from "../state";
import { ButtonWrapper, ShortcutHint, Button } from "./styled";
import * as Icons from "./icons/svgr";

type IconButtonProps = {
  event: string;
  isActive?: boolean;
  src: string;
  shortcut?: string;
} & HTMLProps<HTMLButtonElement>;

function IconButton({
  event = "",
  isActive = false,
  src,
  shortcut,
  children,
  ...props
}: IconButtonProps) {
  const Icon = Icons[src];

  return (
    <ButtonWrapper>
      <Button
        disabled={props.disabled}
        status={isActive ? "active" : ""}
        type="button"
        onClick={() => state.send(event)}
      >
        <Icon />
      </Button>
      {shortcut && <ShortcutHint>{shortcut}</ShortcutHint>}
    </ButtonWrapper>
  );
}

export default memo(IconButton);
