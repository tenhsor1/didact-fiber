import { scheduleUpdate } from "./fiber";

class Component {
  constructor(props) {
    this.props = props;
    this.state = this.state || {};
  }
  setState(partialState) {
    scheduleUpdate(this, partialState);
  }
}

export default Component;
