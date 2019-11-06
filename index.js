const { Plugin } = require('powercord/entities');
const { React, getModule, getModuleByDisplayName, contextMenu } = require('powercord/webpack');
const { getOwnerInstance, waitFor } = require('powercord/util');
const { inject, uninject } = require('powercord/injector');
const { Tooltip, ContextMenu, Icon } = require('powercord/components');

class ManageablePowercordSettings extends Plugin {
  constructor () {
    super();

    this.state = {
      sorting: this.settings.getKeys().includes('sortByAlphabetical'),
      sortingOrder: this.getSortDirection()
    };
  }

  get hiddenSettings () {
    return this.settings.get('hiddenSettings', []);
  }

  get showHiddenSettings () {
    return this.settings.get('showHiddenSettings', true);
  }

  async startPlugin () {
    this.settings.set('settings', []);
    this.classes = {
      standardSidebarView: (await getModule([ 'standardSidebarView', 'contentColumn' ])).standardSidebarView,
      side: (await getModule([ 'topPill', 'header' ])).side
    };

    this.userSettingsWindow = {
      setSection: (await getModule([ 'open', 'updateAccount' ])).setSection
    };

    this.loadCSS(require('path').resolve(__dirname, 'style.scss'));
    this.patchSettingsView();
  }

  pluginWillUnload () {
    uninject('manageableSettings-componentDidUpdate');
    uninject('manageableSettings-componentWillUnmount');
    uninject('manageableSettings-componentDidMount');
    uninject('manageableSettings-renderSidebar');

    this.restoreSettings(true);

    contextMenu.closeContextMenu();
  }

  async patchSettingsView () {
    const Flex = await getModuleByDisplayName('Flex');
    const SettingsView = await getModuleByDisplayName('SettingsView');
    // const TabBar = await getModuleByDisplayName('TabBar');

    inject('manageableSettings-componentDidUpdate', SettingsView.prototype, 'componentDidUpdate', (args) => {
      if (args[0].sections.find(sect => sect.section === 'changelog')) {
        if (this.state.sorting) {
          this.loadSettings(null, false);
        }

        this.updateSettings();
      }

      return args;
    });

    inject('manageableSettings-componentWillUnmount', SettingsView.prototype, 'componentWillUnmount', function (_, res) {
      if (this.props.sections.find(sect => sect.section === 'changelog')) {
        powercord.api.settings._originalTabs = powercord.api.settings._originalTabs || powercord.api.settings.tabs.map(tab => ({ ...tab }));
      }

      return res;
    });

    const _this = this;
    inject('manageableSettings-componentDidMount', SettingsView.prototype, 'componentDidMount', function (_, res) {
      if (this.props.sections.find(sect => sect.section === 'changelog')) {
        _this.loadSettings(true, false);
      }

      return res;
    });

    inject('manageableSettings-renderSidebar', SettingsView.prototype, 'renderSidebar', (_, res) => {
      const PowercordHeader = res.props.children.find(child => child.type.displayName === 'Header' &&
        child.props.children === 'Powercord');

      if (PowercordHeader) {
        PowercordHeader.props.onContextMenu = this.generateContextMenuCallback('Header', { key: res.props.selectedItem });
        PowercordHeader.props.onClick = () => {
          if (!this.settings.get('acknowledgedNagTooltip', false)) {
            this.settings.set('acknowledgedNagTooltip', true);
          }

          if (this.settings.get('sortByAlphabetical') === false) {
            this.settings.delete('sortByAlphabetical');
          } else {
            powercord.api.settings.actions.toggleSetting(this.entityID, 'sortByAlphabetical');
          }

          this.state.sorting = this.settings.getKeys().includes('sortByAlphabetical');

          if (!this.state.sorting) {
            this.restoreSettings();
          } else {
            this.loadSettings();
          }

          // this.saveSettings();
        };
        PowercordHeader.props.className += ' manageableSettings-sidebarHeader';
        PowercordHeader.props.children = React.createElement(Tooltip, {
          text: 'Click to change tabs order',
          position: 'right',
          color: 'brand',
          delay: 5
        }, React.createElement(Flex, {
          justify: Flex.Justify.BETWEEN
        }, 'Powercord', React.createElement('div', {
          className: 'manageableSettings-iconContainer'
        }, React.createElement('span', {
          className: `manageableSettings-sortSettingsIcon ${this.getSortIcon()}`
        }))));

        if (this.settings.get('acknowledgedNagTooltip', false)) {
          PowercordHeader.props.children = PowercordHeader.props.children.props.children;
        }

        for (const child of res.props.children) {
          if (powercord.api.settings.tabs.find(tab => tab.section === child.key)) {
            child.type = require('./components/DragSourceItem');
            child.props.isDragging = false;
            child.props.color = this.hiddenSettings.includes(child.key) ? '#f04747' : null;
            child.props.children = [
              this.hiddenSettings.includes(child.key)
                ? React.createElement(Tooltip, {
                  color: 'red',
                  text: Math.floor((Math.random() * 10) + 1) === 7
                    ? 'It\'s H-I-D-D-E-N! What else did you expect for me to say?! 👺'
                    : `This setting has been marked as hidden. To unhide, right-click and uncheck 'Hide ${child.props.children}'.`
                }, React.createElement(Icon, {
                  className: 'manageableSettings-eye',
                  name: 'EyeHidden'
                }))
                : null, React.createElement('div', {
                className: 'manageableSettings-settingsInner',
                onContextMenu: this.generateContextMenuCallback('Item', { key: child.key,
                  label: child.props.children })
              }, child.props.children)
            ];
          }
        }
      }

      return res;
    });

    this.forceUpdateSidebar();
  }

  getDefaultSettings () {
    return powercord.pluginManager.getPlugins()
      .reduce((filtered, id) => {
        const plugin = powercord.pluginManager.plugins.get(id);
        if (plugin.ready && plugin.registered.settings[0]) {
          filtered.push(plugin.registered.settings[0]);
        }

        return filtered;
      }, []);
  }

  getSettings (forceToDefault = false) {
    const defaultSettings = this.getDefaultSettings();
    const alphabeticalOrder = this.settings.get('sortByAlphabetical', false);

    if (!forceToDefault && this.state.sorting) {
      return [ ...powercord.api.settings._originalTabs ]
        .sort((a, b) =>
          alphabeticalOrder ? a.label.localeCompare(b.label) : b.label.localeCompare(a.label)
        );
    }

    return [ ...powercord.api.settings._originalTabs ]
      .sort((a, b) => defaultSettings.indexOf(a.section) - defaultSettings.indexOf(b.section));
  }

  updateSettings () {
    powercord.api.settings.tabs = powercord.api.settings.tabs
      .filter(setting => this.getDefaultSettings().includes(setting.section));
  }

  getSortIcon () {
    const { sorting, direction } = this.state;
    const alphabeticalOrder = this.settings.get('sortByAlphabetical', false);
    const icon = `sort${sorting
      ? `-${alphabeticalOrder ? 'down' : 'up'}`
      : direction === 'ascending' ? '-down' : direction === 'descending' ? '-up' : ''}`;

    return `fad fa-${icon} fa-fw`;
  }

  getSortDirection () {
    const settings = powercord.api.settings.tabs;
    const ascendingOrder = settings.slice().sort((a, b) => a.label.localeCompare(b.label));
    const descendingOrder = settings.slice().sort((a, b) => b.label.localeCompare(a.label));

    if (settings === ascendingOrder) {
      return 'ascending';
    } else if (settings === descendingOrder) {
      return 'descending';
    }
  }

  restoreSettings (forceShowHidden = false) {
    powercord.api.settings.tabs = this.getSettings(true)
      .filter(tab => !this.showHiddenSettings && !forceShowHidden ? !this.hiddenSettings.includes(tab.section) : tab);

    this.forceUpdateSidebar();
  }

  loadSettings (persist = false, forceUpdate = true) {
    const settings = this.settings.get('settings', []);
    powercord.api.settings._originalTabs = persist ? powercord.api.settings._originalTabs || powercord.api.settings.tabs.map(tab => ({ ...tab })) : powercord.api.settings.tabs.map(tab => ({ ...tab }));
    powercord.api.settings.tabs = this.getSettings()
      .filter(tab => !this.showHiddenSettings ? !this.hiddenSettings.includes(tab.section) : tab)
      .sort((a, b) =>
        persist && settings.includes(a.section) ? settings.indexOf(a.section) - settings.indexOf(b.section) : 1
      );

    if (forceUpdate) {
      this.forceUpdateSidebar();
    }
  }

  saveSettings () {
    const settings = [ ...powercord.api.settings.tabs ].map(tab => tab.section);
    this.settings.set('settings', settings);
  }

  setUserSettingsSection (index) {
    if (!document.querySelector(`.${this.classes.standardSidebarView.split(' ')[0]}`)) {
      const settings = powercord.api.settings.tabs;
      let section = 0;

      if (index > -1) {
        section = index % settings.length;
      }

      this.userSettingsWindow.setSection(settings.length > 0 ? settings[section].section : 'My Account');
    }
  }

  async forceUpdateSidebar () {
    this.updateSettings();

    const sidebarViewQuery = `.${this.classes.standardSidebarView.split(' ')[0]}`;
    getOwnerInstance(await waitFor(sidebarViewQuery))._reactInternalFiber.return.stateNode.forceUpdate();
  }

  generateContextMenuCallback (type, options) {
    return (e) => {
      const match = this.hiddenSettings.length === this.getDefaultSettings().length;

      contextMenu.openContextMenu(e, () =>
        React.createElement(ContextMenu, {
          itemGroups: [ [ type === 'Header'
            ? {
              type: 'button',
              name: `${match ? 'Show' : 'Hide'} All Settings`,
              icon: `eye${match ? '' : '-slash'}-duotone`,
              highlight: match ? '#7289da' : '#f04747',
              onClick: () => {
                const index = powercord.api.settings.tabs.findIndex(tab => tab.section === options.key);

                if (this.hiddenSettings.length === this.getDefaultSettings().length) {
                  this.settings.set('hiddenSettings', []);
                } else {
                  this.settings.set('hiddenSettings', this.getDefaultSettings());
                }

                if (!this.showHiddenSettings) {
                  setImmediate(() => {
                    this.setUserSettingsSection(index);
                  });
                }

                this.loadSettings(true);
              }
            }
            : '', {
            type: 'checkbox',
            name: type === 'Item' ? `Hide ${options.label}` : 'Show Hidden Settings',
            defaultState: type === 'Item' ? this.hiddenSettings.includes(options.key) : this.showHiddenSettings,
            seperate: true,
            onToggle: (state) => {
              const index = powercord.api.settings.tabs.findIndex(tab => tab.section === options.key);

              if (type === 'Item') {
                this.settings.set('hiddenSettings', !this.hiddenSettings.includes(options.key)
                  ? [ ...this.hiddenSettings, options.key ]
                  : this.hiddenSettings.filter(hiddenSetting => hiddenSetting !== options.key));
              } else {
                this.settings.set('showHiddenSettings', state);
              }

              if (!this.state.sorting) {
                this.restoreSettings();
              } else {
                this.loadSettings(true);
              }

              if (!this.showHiddenSettings) {
                setImmediate(() => {
                  this.setUserSettingsSection(index);
                });
              }

              // this.saveSettings();
            }
          } ] ]
        })
      );
    };
  }
}

module.exports = ManageablePowercordSettings;
