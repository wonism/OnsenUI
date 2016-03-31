import React from 'react';
import ReactDOM from 'react-dom';

class PullHook extends React.Component {
  componentDidMount() {
    this.refs.pullHook.addEventListener('changestate', this.props.onChange);
    this.refs.pullHook.setActionCallback(this.props.onLoad);
  }

  componentWillUnmount() {
    this.refs.pullHook.removeEventListener('changestate', this.props.onChange);
  }

  render() {
    return <ons-pull-hook ref="pullHook" {...this.props} />;
  }
};

PullHook.propTypes = {
  onLoad: React.PropTypes.func,
  onChange: React.PropTypes.func,
}

export default PullHook;
