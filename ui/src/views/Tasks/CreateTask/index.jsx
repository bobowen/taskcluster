import React, { Component, Fragment } from 'react';
import { Redirect } from 'react-router-dom';
import { parse, stringify } from 'qs';
import { withApollo } from 'react-apollo';
import storage from 'localforage';
import merge from 'deepmerge';
import { load, dump } from 'js-yaml';
import { bool } from 'prop-types';
import {
  toDate,
  parseISO,
  differenceInMilliseconds,
  addMilliseconds,
  addHours,
} from 'date-fns';
import { withStyles } from '@material-ui/core/styles';
import Switch from '@material-ui/core/Switch';
import Typography from '@material-ui/core/Typography';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import TextField from '@material-ui/core/TextField';
import MenuItem from '@material-ui/core/MenuItem';
import List from '@material-ui/core/List';
import ListItem from '@material-ui/core/ListItem';
import ListItemText from '@material-ui/core/ListItemText';
import ListSubheader from '@material-ui/core/ListSubheader';
import LinkIcon from 'mdi-react/LinkIcon';
import ContentSaveIcon from 'mdi-react/ContentSaveIcon';
import RotateLeftIcon from 'mdi-react/RotateLeftIcon';
import ClockOutlineIcon from 'mdi-react/ClockOutlineIcon';
import { Box } from '@material-ui/core';
import CodeEditor from '../../../components/CodeEditor';
import SpeedDial from '../../../components/SpeedDial';
import SiteSpecific from '../../../components/SiteSpecific';
import SpeedDialAction from '../../../components/SpeedDialAction';
import HelpView from '../../../components/HelpView';
import MuiErrorPanel from '../../../components/ErrorPanel/MuiErrorPanel';
import Dashboard from '../../../components/Dashboard';
import ErrorPanel from '../../../components/ErrorPanel';
import { nice } from '../../../utils/slugid';
import {
  TASKS_CREATE_STORAGE_KEY,
  UI_SCHEDULER_ID,
  ISO_8601_REGEX,
  TASK_PAYLOAD_SCHEMAS,
} from '../../../utils/constants';
import urls from '../../../utils/urls';
import createTaskQuery from '../createTask.graphql';
import Button from '../../../components/Button';
import db from '../../../utils/db';
import validateTaskPayloadSchemas from '../../../utils/validateTaskPayloadSchemas';

const tutorialWorkerPoolId =
  window.env.SITE_SPECIFIC.tutorial_worker_pool_id ||
  'proj-getting-started/tutorial';
const tutorialWorkerSchema =
  window.env.SITE_SPECIFIC.tutorial_worker_schema || 'docker-worker';
const defaultTask = schema => {
  const schemaDefinition =
    TASK_PAYLOAD_SCHEMAS[schema] || TASK_PAYLOAD_SCHEMAS['docker-worker'];

  return {
    taskQueueId: tutorialWorkerPoolId,
    schedulerId: UI_SCHEDULER_ID,
    created: new Date().toISOString(),
    deadline: toDate(addHours(new Date(), 3)).toISOString(),
    payload: schemaDefinition.samplePayload,
    metadata: {
      name: 'example-task',
      description: 'An **example** task',
      owner: 'name@example.com',
      source: `${window.location.origin}/tasks/create`,
    },
  };
};

@withApollo
@withStyles(theme => ({
  createIcon: {
    ...theme.mixins.successIcon,
  },
  createIconSpan: {
    ...theme.mixins.fab,
    ...theme.mixins.actionButton,
    right: theme.spacing(11),
  },
  listItemButton: {
    ...theme.mixins.listItemButton,
  },
  validationErrors: {
    whiteSpace: 'pre',
  },
}))
export default class CreateTask extends Component {
  static defaultProps = {
    interactive: false,
  };

  static propTypes = {
    /** If true, the task will initially be set as an interactive task. */
    interactive: bool,
  };

  state = {
    task: null,
    error: null,
    invalid: null,
    createdTaskError: null,
    loading: false,
    recentTaskDefinitions: [],
    payloadSchema: tutorialWorkerSchema,
    validationErrors: null,
  };

  async getRecentTaskDefinitions() {
    try {
      return await db.taskDefinitions
        .orderBy('created')
        .limit(5)
        .reverse()
        .toArray();
    } catch (_) {
      return [];
    }
  }

  async componentDidMount() {
    const task = await this.getTask();
    const recentTaskDefinitions = await this.getRecentTaskDefinitions();

    try {
      this.setState({
        recentTaskDefinitions,
        task: this.parameterizeTask(task),
        error: null,
      });
    } catch (err) {
      this.setState({
        error: err,
        task: null,
      });
    }
  }

  async getTask() {
    const { location } = this.props;
    const { task, payloadSchema } = this.state;

    if (task) {
      return task;
    }

    if (location.state && location.state.task) {
      return location.state.task;
    }

    try {
      const task = await storage.getItem(TASKS_CREATE_STORAGE_KEY);

      return task || defaultTask(payloadSchema);
    } catch (err) {
      return defaultTask(payloadSchema);
    }
  }

  makeInteractive(payload) {
    const task = merge(payload, {
      payload: {
        features: {
          interactive: true,
        },
      },
    });

    if (task.payload.caches) {
      delete task.payload.caches;
    }

    // Minimum of an hour
    task.payload.maxRunTime = Math.max(3600, task.payload.maxRunTime || 0);

    // Avoid side-effects
    if (task.routes) {
      delete task.routes;
    }

    return task;
  }

  handleCreateTask = async () => {
    const { interactive } = parse(this.props.location.search.slice(1));
    const { task } = this.state;

    if (task) {
      const taskId = nice();
      let payload = load(task);

      db.taskDefinitions.put(payload);

      if (interactive) {
        payload = this.makeInteractive(payload);
      }

      this.setState({ loading: true });

      try {
        await this.props.client.mutate({
          mutation: createTaskQuery,
          variables: {
            taskId,
            task: payload,
          },
        });

        this.setState({ loading: false, createdTaskId: taskId });
        storage.setItem(TASKS_CREATE_STORAGE_KEY, payload);
      } catch (err) {
        this.setState({
          loading: false,
          createdTaskError: err,
          createdTaskId: null,
        });
      }
    }
  };

  handleInteractiveChange = ({ target: { checked } }) => {
    const query = {
      ...parse(this.props.location.search.slice(1)),
      interactive: checked ? '1' : undefined,
    };

    this.props.history.replace(
      `/tasks/create${stringify(query, { addQueryPrefix: true })}`
    );
  };

  handleResetEditor = () =>
    this.setState({
      createdTaskError: null,
      task: this.parameterizeTask(defaultTask(this.state.payloadSchema)),
      invalid: false,
    });

  handleRecentTaskDefinitionClick = task => {
    this.setState({
      task: this.parameterizeTask(task),
    });
  };

  handleTaskChange = value => {
    try {
      load(value);
      this.setState({ invalid: false, task: value });
    } catch (err) {
      this.setState({ invalid: true, task: value });
    }
  };

  handlePayloadSchemaChange = event => {
    this.setState({ payloadSchema: event.target.value });
  };

  handleLint = async () => {
    const { payloadSchema, task } = this.state;
    const schema = TASK_PAYLOAD_SCHEMAS[payloadSchema];
    const input = load(task);
    const errors = await validateTaskPayloadSchemas(
      input,
      schema && schema.type,
      schema && schema.schema
    );

    this.setState({
      validationErrors: errors.length ? errors.join('\n') : null,
    });
  };

  handleUpdateTimestamps = () =>
    this.setState({
      createdTaskError: null,
      task: this.parameterizeTask(load(this.state.task)),
    });

  parameterizeTask(task) {
    const offset = differenceInMilliseconds(new Date(), parseISO(task.created));
    // Increment all timestamps in the task by offset
    const iter = obj => {
      if (!obj) {
        return obj;
      }

      switch (typeof obj) {
        case 'object':
          return Array.isArray(obj)
            ? obj.map(iter)
            : Object.entries(obj).reduce(
                (o, [key, value]) => ({ ...o, [key]: iter(value) }),
                {}
              );

        case 'string':
          return ISO_8601_REGEX.test(obj)
            ? toDate(addMilliseconds(parseISO(obj), offset)).toISOString()
            : obj;

        default:
          return obj;
      }
    };

    return `${dump(iter(task), { noCompatMode: true, noRefs: true })}`;
  }

  render() {
    const { location, description, classes } = this.props;
    const { interactive } = parse(location.search.slice(1));
    const {
      task,
      error,
      createdTaskError,
      invalid,
      createdTaskId,
      loading,
      recentTaskDefinitions,
      payloadSchema,
      validationErrors,
    } = this.state;

    if (createdTaskId && interactive) {
      return <Redirect to={`/tasks/${createdTaskId}/connect`} push />;
    }

    // If loaded, redirect to task inspector.
    // We'll show errors later if there are errors.
    if (createdTaskId) {
      return <Redirect to={`/tasks/${createdTaskId}`} push />;
    }

    return (
      <Dashboard
        title="Create Task"
        helpView={
          <HelpView description={description}>
            <Typography variant="body2">
              For details on what you can write, refer to the{' '}
              <a
                href={urls.docs('/')}
                target="_blank"
                rel="noopener noreferrer">
                documentation
              </a>
              . When you submit a task here, you will be taken to{' '}
              {interactive
                ? 'connect to the interactive task'
                : 'inspect the created task'}
              . Your task will be saved so you can come back and experiment with
              variations.
              <SiteSpecific>
                If you are just getting started, `%tutorial_worker_pool_id%` is
                a good choice for `taskQueueId`.
              </SiteSpecific>
            </Typography>
          </HelpView>
        }>
        <Fragment>
          {error ? (
            <ErrorPanel fixed error={error} />
          ) : (
            <Fragment>
              <ErrorPanel fixed error={createdTaskError} />
              <Box style={{ display: 'flex', marginBottom: 10 }}>
                <FormControlLabel
                  style={{ flexBasis: 0, flexGrow: 1 }}
                  control={
                    <Switch
                      checked={interactive}
                      onChange={this.handleInteractiveChange}
                      color="secondary"
                    />
                  }
                  label="Interactive"
                />
                <FormControlLabel
                  style={{ alignSelf: 'flex-end' }}
                  control={
                    <TextField
                      select
                      labelId="payload-schema-label"
                      id="payload-schema"
                      value={payloadSchema}
                      defaultChecked
                      onChange={this.handlePayloadSchemaChange}>
                      {Object.entries(TASK_PAYLOAD_SCHEMAS).map(
                        ([key, schema]) => (
                          <MenuItem key={key} value={key}>
                            {schema.label}
                          </MenuItem>
                        )
                      )}
                    </TextField>
                  }
                />
                <Button
                  style={{ alignSelf: 'flex-end' }}
                  size="small"
                  onClick={this.handleLint}>
                  Validate schema
                </Button>
              </Box>
              {validationErrors && (
                <MuiErrorPanel
                  className={classes.validationErrors}
                  error={validationErrors}
                />
              )}
              <CodeEditor
                mode="yaml"
                lint
                value={task || ''}
                onChange={this.handleTaskChange}
              />
              <br />
              {Boolean(recentTaskDefinitions.length) && (
                <List
                  dense
                  subheader={
                    <ListSubheader component="div">
                      Recent Task Definitions
                    </ListSubheader>
                  }>
                  {this.state.recentTaskDefinitions.map(task => (
                    <ListItem
                      className={classes.listItemButton}
                      button
                      onClick={() => {
                        this.handleRecentTaskDefinitionClick(task);
                      }}
                      key={task.metadata.name}>
                      <ListItemText
                        disableTypography
                        primary={
                          <Typography variant="body2">
                            {task.metadata.name}
                          </Typography>
                        }
                      />
                      <LinkIcon />
                    </ListItem>
                  ))}
                </List>
              )}
              <Button
                spanProps={{ className: classes.createIconSpan }}
                tooltipProps={{ title: 'Create Task' }}
                requiresAuth
                disabled={!task || invalid || loading}
                variant="round"
                className={classes.createIcon}
                onClick={this.handleCreateTask}>
                <ContentSaveIcon />
              </Button>
              <SpeedDial>
                <SpeedDialAction
                  tooltipOpen
                  icon={<RotateLeftIcon />}
                  onClick={this.handleResetEditor}
                  tooltipTitle="Reset Editor"
                />
                <SpeedDialAction
                  tooltipOpen
                  icon={<ClockOutlineIcon />}
                  onClick={this.handleUpdateTimestamps}
                  tooltipTitle="Update Timestamps"
                  FabProps={{
                    disabled: !task || invalid,
                  }}
                />
              </SpeedDial>
            </Fragment>
          )}
        </Fragment>
      </Dashboard>
    );
  }
}
