import { useState, useCallback } from 'react';
import { Modal, Form, Select, message, Spin } from 'antd';
import { batchCreateShare, searchUsers } from '@/api';
import { getErrorMessage } from '@/utils/errorCodes';
import type { FileInfo } from '@/types';

interface UserOption {
  value: number;
  label: string;
}

const SHARE_PERM_OPTIONS = [
  { value: 1, label: '只读' },
  { value: 2, label: '可上传' },
];

const EXPIRE_TYPE_OPTIONS = [
  { value: 1, label: '永久' },
  { value: 2, label: '7天' },
  { value: 3, label: '30天' },
];

interface BatchShareModalProps {
  open: boolean;
  selectedFiles: FileInfo[];
  onClose: () => void;
  onSuccess: () => void;
}

function BatchShareModal({ open, selectedFiles, onClose, onSuccess }: BatchShareModalProps): React.ReactNode {
  const [form] = Form.useForm();
  const [submitting, setSubmitting] = useState(false);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [searching, setSearching] = useState(false);

  const handleSearchUser = useCallback(async (keyword: string) => {
    if (!keyword || keyword.length < 1) {
      setUserOptions([]);
      return;
    }
    setSearching(true);
    try {
      const res = await searchUsers(keyword);
      if (res.data) {
        const options = res.data.map((u) => ({
          value: u.id,
          label: `${u.nickname} (${u.username})`,
        }));
        setUserOptions(options);
      }
    } catch {
      setUserOptions([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSubmit = async () => {
    if (selectedFiles.length === 0) {
      message.warning('请选择要分享的文件');
      return;
    }
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      const items = selectedFiles.map((file) => ({
        resourceId: file.id,
        shareType: 1, // 文件
        receiveUserId: values.receiveUserId,
        sharePerm: values.sharePerm,
        expireType: values.expireType,
      }));
      await batchCreateShare({ items });
      message.success(`已成功分享 ${items.length} 个文件`);
      form.resetFields();
      onSuccess();
      onClose();
    } catch (err: unknown) {
      const typedErr = err as { response?: { data?: { code?: number } } };
      message.error(getErrorMessage(typedErr.response?.data?.code));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`批量分享 (已选 ${selectedFiles.length} 个文件)`}
      open={open}
      onOk={handleSubmit}
      onCancel={() => {
        form.resetFields();
        onClose();
      }}
      confirmLoading={submitting}
      destroyOnClose
    >
      <Form form={form} layout="vertical" initialValues={{ sharePerm: 1, expireType: 1 }}>
        <Form.Item
          name="receiveUserId"
          label="目标用户"
          rules={[{ required: true, message: '请选择目标用户' }]}
        >
          <Select
            showSearch
            placeholder="输入用户名搜索"
            filterOption={false}
            onSearch={handleSearchUser}
            notFoundContent={searching ? <Spin size="small" /> : null}
            options={userOptions}
          />
        </Form.Item>
        <Form.Item
          name="sharePerm"
          label="分享权限"
          rules={[{ required: true }]}
        >
          <Select options={SHARE_PERM_OPTIONS} />
        </Form.Item>
        <Form.Item
          name="expireType"
          label="过期时间"
          rules={[{ required: true }]}
        >
          <Select options={EXPIRE_TYPE_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default BatchShareModal;
