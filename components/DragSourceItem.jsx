const { React, getModule, getModuleByDisplayName, constants: { Colors } } = require('powercord/webpack');
const { AsyncComponent } = require('powercord/components');

const classes = getModule([ 'topPill' ], false);
const Clickable = AsyncComponent.from(getModuleByDisplayName('Clickable'));
const DragSourceItem = class DragSourceItem extends React.PureComponent {
  constructor () {
    super();

    this.state = {
      hover: false,
      active: false
    };

    this.handleClick = (e) => this.props.onClick
      ? this.props.onClick(e)
      : this.props.onItemSelect !== null && this.props.onItemSelect(this.props.id);

    this.handleMouseDown = () => this.props.color !== null && this.setState({ active: true });
    this.handleMouseUp = () => this.setState({ active: false });
    this.handleMouseOver = () => this.setState({ hover: true });
    this.handleMouseOut = () => this.setState({ hover: false,
      active: false });
  }

  getStyle () {
    const { hex2rgb } = getModule([ 'isValidHex' ], false);
    const { color, id, selectedItem, itemType } = this.props;

    function getStateColor (color, state) {
      if (!color) {
        return null;
      }

      switch (state) {
        case DragSourceItem.States.SELECTED:
          return { backgroundColor: color,
            color: Colors.WHITE };
        case DragSourceItem.States.HOVER:
          return { backgroundColor: hex2rgb(color, 0.1),
            color };
        default:
          return { color };
      }
    }

    if (color) {
      switch (itemType) {
        case DragSourceItem.Types.SIDE:
          if ((id && id === selectedItem) || this.state.active) {
            return getStateColor(color, DragSourceItem.States.SELECTED);
          } else if (this.state.hover) {
            return getStateColor(color, DragSourceItem.States.HOVER);
          }

          return getStateColor(color);
        case DragSourceItem.Types.TOP:
          if (id === selectedItem) {
            return { borderColor: color,
              color };
          } else if (this.state.hover) {
            return { borderColor: hex2rgb(color, 0.1),
              color: hex2rgb(color, 0.6) };
          }

          return { borderColor: 'transparent',
            color: hex2rgb(color, 0.4) };
        case DragSourceItem.Types.TOP_PILL:
          if (id === selectedItem) {
            return { backgroundColor: hex2rgb(color, 0.2),
              color };
          }

          return { backgroundColor: color,
            color: Colors.WHITE };
        default:
          return null;
      }
    }
  }

  render () {
    const { color, id, selectedItem, isDragging } = this.props;
    const item = React.createElement(Clickable, {
      className: [ this.props.className, classes.item, !color && id === selectedItem ? classes.selected : null,
        !color ? classes.themed : null ].filter(Boolean).join(' '),
      style: this.getStyle(),
      onMouseEnter: color ? this.handleMouseOver : null,
      onClick: this.handleClick,
      onMouseLeave: color ? this.handleMouseOut : null,
      onMouseUp: color ? this.handleMouseUp : null,
      onMouseDown: color ? this.handleMouseDown : null,
      'aria-label': this.props['aria-label']
    }, this.props.children);

    if (isDragging) {
      return React.createElement('div', {
        className: 'dragged-2XvZ89'
      }, item);
    }

    return item;
  }
};

DragSourceItem.States = {
  DEFAULT: 'Default',
  HOVER: 'Hover',
  SELECTED: 'Selected'
};

DragSourceItem.Types = {
  SIDE: classes.side.split(' ')[0],
  TOP: classes.top.split(' ')[0],
  TOP_PILL: classes.topPill.split(' ')[0]
};

module.exports = DragSourceItem;
