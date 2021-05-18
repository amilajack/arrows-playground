import {useState, useEffect} from 'react'
import {isEqual} from 'lodash';
import state from "../state";

type Selector = (_state: typeof state) => void;

export const useSelector = (selector: Selector) => {
  let [initialState, setState] = useState({ ...state });
  const onUpdate = (newState: typeof state) => {
    if (!isEqual(selector(newState), selector(initialState))) {
      setState({
        ...newState,
      });
    }
  };
  useEffect(() => state.onUpdate(onUpdate), []);
  return initialState;
};
